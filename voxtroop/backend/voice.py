import os

from fastapi import APIRouter, Depends, HTTPException, Request, Response, UploadFile
from openai import APIError, OpenAI
from pydantic import BaseModel, Field

from backend.api import admin, tenant

router = APIRouter(prefix="/api/{business}/voice", dependencies=[Depends(admin), Depends(tenant)])


def provider(request, *variables):
    if request.app.state.mode == "mock":
        raise HTTPException(503, "Voice requires live AI mode. Continue with text.")
    if not os.getenv("OPENAI_API_KEY"):
        raise HTTPException(503, "Voice requires a configured OpenAI API key")
    values = [os.getenv(variable) for variable in variables]
    if not all(values):
        raise HTTPException(503, "Voice provider settings are incomplete")
    return OpenAI(timeout=35, max_retries=0), values


@router.post("/transcribe")
def transcribe(file: UploadFile, request: Request):
    content = file.file.read(5_000_001)
    extensions = {"audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "mp4", "audio/wav": "wav"}
    kind = (file.content_type or "").split(";")[0]
    if kind not in extensions or not content:
        raise HTTPException(415, "Send WebM, Ogg, MP4 or WAV audio")
    if len(content) > 5_000_000:
        raise HTTPException(413, "Audio exceeds 5 MB")
    client, (model,) = provider(request, "OPENAI_TRANSCRIPTION_MODEL")
    try:
        with client:
            result = client.audio.transcriptions.create(
                model=model, file=(f"recording.{extensions[kind]}", content, kind),
            )
    except APIError as error:
        raise HTTPException(502, "Transcription provider failed") from error
    return {"text": result.text}


class Speech(BaseModel):
    text: str = Field(min_length=1, max_length=3000)


@router.post("/speak")
def speak(body: Speech, request: Request):
    client, (model, voice) = provider(request, "OPENAI_TTS_MODEL", "OPENAI_TTS_VOICE")
    try:
        with client:
            audio = client.audio.speech.create(model=model, voice=voice, input=body.text, response_format="mp3")
    except APIError as error:
        raise HTTPException(502, "Speech provider failed") from error
    return Response(audio.content, media_type="audio/mpeg", headers={"Cache-Control": "no-store"})
