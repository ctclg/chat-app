#main.py

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
from pydantic import BaseModel, EmailStr
import json
from typing import List
from fastapi import BackgroundTasks
from fastapi_mail import FastMail, MessageSchema, ConnectionConfig
import secrets

class ChatSettings(BaseModel):
    system_prompt: str
    model: str
    temperature: float
    max_tokens: int

# User registration data model
class UserRegistration(BaseModel):
    email: str

# Update the ConnectionConfig model
class ConnectionConfig(BaseModel):
    MAIL_USERNAME: str
    MAIL_PASSWORD: str
    MAIL_FROM: EmailStr
    MAIL_PORT: int
    MAIL_SERVER: str
    MAIL_TLS: bool
    MAIL_SSL: bool

# Email configuration
conf = ConnectionConfig(
    MAIL_USERNAME = "thomas.lundborg@gmail.com",
    MAIL_PASSWORD = "MCognAq1",
    MAIL_FROM = "thomas.lundborg@gmail.com",
    MAIL_PORT = 587,
    MAIL_SERVER = "smtp.gmail.com",
    MAIL_TLS = False,
    MAIL_SSL = False
)

class MessageSchema(BaseModel):
    subject: str
    recipients: list[EmailStr]
    body: str

# Send confirmation email
async def send_confirmation_email(email: str, confirmation_token: str):
    message = MessageSchema(
        subject="Confirm your email address",
        recipients=[email],
        body=f"Click the following link to confirm your email address: https://yourwebsite.com/confirm?token={confirmation_token}"
    )

    fm = FastMail(conf)
    await fm.send_message(message)

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
        messages = []
        #messages = [{"role": "system", "content": DEFAULT_SETTINGS["system_prompt"]}]
        messages.extend(conversation_list)
        messages.append({"role": "user", "content": message})
        #print(messages)
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

# Register route to send confirmation email
@app.post("/register")
async def register_user(user_data: UserRegistration, background_tasks: BackgroundTasks):
    # Generate a unique token for email confirmation
    confirmation_token = secrets.token_urlsafe(32)
    # Send confirmation email asynchronously
    background_tasks.add_task(send_confirmation_email, user_data.email, confirmation_token)
    
    return {"message": "Confirmation email sent. Please check your inbox."}

# User confirmation endpoint
@app.get("/confirm")
async def confirm_email(token: str):
    # Verify the token and register the user
    # Implement your logic to verify the token and register the user
    return {"message": "Email confirmed. You are now registered."}

@app.post("/save-conversation")
async def save_conversation(conversation_data: List[dict]):
    try:
        # Implement logic to save conversation_data to Azure data store
        # Example: Azure Blob Storage, Azure Cosmos DB, etc.
        
        return JSONResponse(content={"message": "Conversation saved successfully"})
    except Exception as e:
        logger.error(f"Error saving conversation: {str(e)}")
        logger.exception("Full exception details:")
        return JSONResponse(content={"error": str(e)}, status_code=500)

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)