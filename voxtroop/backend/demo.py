"""Run the real graph and local Qdrant with deterministic providers."""
import json
from pathlib import Path
from tempfile import TemporaryDirectory

from backend.agent import build_graph
from backend.config import DEMO
from backend.knowledge import DEMO_KNOWLEDGE, Knowledge


def demonstrate():
    business = "edunext"
    config = DEMO[business].model_dump()
    with TemporaryDirectory() as directory:
        knowledge = Knowledge(Path(directory) / "qdrant")
        try:
            knowledge.ingest(business, "edunext-demo.txt", DEMO_KNOWLEDGE[business])
            graph = build_graph(knowledge)
            state = {"business": business, "config": config, "history": [], "profile": {}}
            questions = [
                "What does the Foundation program cost?",
                "My name is Maya. I need a course next week. Email maya@example.org.",
            ]
            for question in questions:
                output = graph.invoke({**state, "message": question})
                state["profile"] = output["profile"]
                state["history"] += [{"role": "user", "content": question},
                                     {"role": "assistant", "content": output["reply"]}]
                yield {key: output.get(key) for key in ("reply", "trace", "points", "reasons", "assessment")}
        finally:
            knowledge.client.close()


if __name__ == "__main__":
    print(json.dumps({"mode": "mock", "turns": list(demonstrate())}, ensure_ascii=True, indent=2))
