from fastapi import FastAPI, Request, Form
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
import openai
import os
from dotenv import load_dotenv
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# Initialize FastAPI app
app = FastAPI()

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# Templates
templates = Jinja2Templates(directory="templates")

# Initialize OpenAI client
openai.api_key = os.getenv("OPENAI_API_KEY")

@app.get("/")
async def root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.post("/chat")
async def chat(message: str = Form(...)):
    try:
        logger.info("Attempting to call OpenAI API")

        response = openai.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "user", "content": message}
            ]
        )
        return JSONResponse(content={
            "response": response.choices[0].message.content
        })
        logger.info("OpenAI API call successful")
    except Exception as e:
        logger.error(f"Error calling OpenAI API: {str(e)}")
        return JSONResponse(content={"error": str(e)}, status_code=500)