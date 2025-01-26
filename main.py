from fastapi import FastAPI, Request, Form
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
import openai
import os
from dotenv import load_dotenv
import logging
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from pydantic import BaseModel
import json

class ChatSettings(BaseModel):
    system_prompt: str
    model: str
    temperature: float
    max_tokens: int

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Default settings
DEFAULT_SETTINGS = {
    "system_prompt": "You are a helpful assistant.",
    "model": "gpt-3.5-turbo",
    "temperature": 0.7,
    "max_tokens": 1000
}

@app.get("/")
async def root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.post("/chat")
async def chat(message: str = Form(...), conversation: str = Form(default="[]")):
    try:
        logger.info(f"Received message: {message}")
        
        # Parse conversation JSON string to list
        try:
            conversation_list = json.loads(conversation)
        except json.JSONDecodeError:
            conversation_list = []
        
        # Prepare messages for API call
        messages = [{"role": "system", "content": DEFAULT_SETTINGS["system_prompt"]}]
        messages.extend(conversation_list)
        messages.append({"role": "user", "content": message})

        response = client.chat.completions.create(
            model=DEFAULT_SETTINGS["model"],  # Now using the selected model
            messages=messages,
            temperature=DEFAULT_SETTINGS["temperature"],
            max_tokens=DEFAULT_SETTINGS["max_tokens"]
        )

        return JSONResponse(content={
            "response": response.choices[0].message.content
        })
    except Exception as e:
        logger.error(f"Error calling OpenAI API: {str(e)}")
        logger.exception("Full exception details:")
        return JSONResponse(content={"error": str(e)}, status_code=500)

@app.post("/update-settings")
async def update_settings(settings: ChatSettings):
    global DEFAULT_SETTINGS
    DEFAULT_SETTINGS = settings.dict()
    return JSONResponse(content={"message": "Settings updated successfully"})

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)