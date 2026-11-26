import hashlib
import io
import logging
import math
import re
from threading import RLock
from uuid import NAMESPACE_URL, uuid5

from langchain_text_splitters import RecursiveCharacterTextSplitter
from pypdf import PdfReader
from qdrant_client import QdrantClient, models


logger = logging.getLogger(__name__)

DEMO_KNOWLEDGE = {
    "edunext": "EduNext Academy offers live online mathematics and science courses. The fictional Foundation program costs INR 12,000 per term. Trial classes are available by consultation. The fictional Generative AI program lasts six months and costs INR 50,000. Python basics are recommended. Staff must approve discount exceptions. Ask for a counselling appointment to discuss eligibility.",
    "urbanhomes": "UrbanHomes offers fictional property consultations and guided apartment tours. The Maple Residences two-bedroom apartments start at INR 65 lakh. Tours require an appointment.",
}


def mock_embedding(text):
    vector = [0.0] * 256
    for term in re.findall(r"\w+", text.casefold()):
        digest = hashlib.sha256(term.encode()).digest()
        vector[digest[0]] += 1 if digest[1] % 2 else -1
    norm = math.sqrt(sum(value**2 for value in vector)) or 1
    return [value / norm for value in vector]


def extract_text(name, content):
    if name.lower().endswith(".txt"):
        return content.decode("utf-8-sig")
    if name.lower().endswith(".pdf"):
        reader = PdfReader(io.BytesIO(content))
        if reader.is_encrypted or len(reader.pages) > 100:
            raise ValueError("Upload an unencrypted PDF of at most 100 pages")
        return "\n".join(page.extract_text() for page in reader.pages)
    raise ValueError("Upload a UTF-8 text file or PDF")


class Knowledge:
    def __init__(self, path, embeddings=None):
        self.client = QdrantClient(path=str(path))
        self.embeddings = embeddings
        self.lock = RLock()
        self.splitter = RecursiveCharacterTextSplitter(chunk_size=900, chunk_overlap=120)

    def filter(self, business, document=None):
        fields = {"business": business}
        if document:
            fields["document"] = document
        return models.Filter(must=[
            models.FieldCondition(key=key, match=models.MatchValue(value=value))
            for key, value in fields.items()
        ])

    def ingest(self, business, source, text):
        chunks = self.splitter.split_text(text.strip())
        if not chunks or len(chunks) > 500:
            raise ValueError("Document must contain text and yield at most 500 chunks")
        document = hashlib.sha256(text.strip().encode()).hexdigest()
        with self.lock:
            if self.client.collection_exists("knowledge") and self.client.count(
                "knowledge", count_filter=self.filter(business, document)
            ).count:
                return document
            vectors = self.embeddings.embed_documents(chunks) if self.embeddings else [
                mock_embedding(chunk) for chunk in chunks
            ]
            if not self.client.collection_exists("knowledge"):
                self.client.create_collection("knowledge", vectors_config=models.VectorParams(
                    size=len(vectors[0]), distance=models.Distance.COSINE
                ))
            self.client.upsert("knowledge", [
                models.PointStruct(
                    id=str(uuid5(NAMESPACE_URL, f"{business}/{document}/{index}")),
                    vector=vector,
                    payload={"business": business, "document": document, "source": source,
                             "chunk": index + 1, "text": chunk},
                )
                for index, (chunk, vector) in enumerate(zip(chunks, vectors, strict=True))
            ])
        return document

    def search(self, business, query):
        with self.lock:
            if not self.client.collection_exists("knowledge"):
                return []
            vector = self.embeddings.embed_query(query) if self.embeddings else mock_embedding(query)
            threshold = 0.35 if self.embeddings else 0.15
            result = self.client.query_points(
                "knowledge", query=vector, query_filter=self.filter(business),
                limit=4,
            )
        logger.debug("Retrieval dimension=%d threshold=%.2f top_scores=%s",
                     len(vector), threshold, [round(point.score, 3) for point in result.points])
        return [point.payload | {"score": round(point.score, 3)}
                for point in result.points if point.score >= threshold]

    def documents(self, business):
        with self.lock:
            if not self.client.collection_exists("knowledge"):
                return []
            documents = {}
            offset = None
            while True:
                points, offset = self.client.scroll(
                    "knowledge", scroll_filter=self.filter(business), offset=offset, limit=128,
                )
                for point in points:
                    item = point.payload
                    record = documents.setdefault(item["document"], {
                        "id": item["document"], "source": item["source"], "chunks": 0,
                    })
                    record["chunks"] += 1
                if offset is None:
                    return list(documents.values())

    def delete(self, business, document):
        with self.lock:
            if self.client.collection_exists("knowledge"):
                self.client.delete("knowledge", models.FilterSelector(filter=self.filter(business, document)))
