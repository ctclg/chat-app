from fastapi import FastAPI, Request, Form
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
import os
from dotenv import load_dotenv
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv(verbose=True)

# Initialize FastAPI app
app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# Templates
templates = Jinja2Templates(directory="templates")

# Initialize OpenAI client - modified initialization
try:
    client = OpenAI(
        api_key=os.getenv("OPENAI_API_KEY"),
        base_url="https://api.openai.com/v1"  # Explicitly set the base URL
    )
    logger.info("OpenAI client initialized successfully")
except Exception as e:
    logger.error(f"Error initializing OpenAI client: {str(e)}")
    client = None

@app.get("/")
async def root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.post("/chat")
async def chat(message: str = Form(...)):
    try:
        if not client:
            raise Exception("OpenAI client not properly initialized")
            
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "user", "content": message}
            ]
        )
        return JSONResponse(content={
            "response": response.choices[0].message.content
        })
    except Exception as e:
        logger.error(f"Error in chat endpoint: {str(e)}")
        return JSONResponse(
            content={"error": f"An error occurred: {str(e)}"},
            status_code=500
        )

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "openai_client": "initialized" if client else "not initialized"
    }