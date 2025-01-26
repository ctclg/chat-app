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


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# Initialize FastAPI app
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with your actual domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# Templates
templates = Jinja2Templates(directory="templates")

# Initialize OpenAI client
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))



@app.get("/")
async def root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.post("/chat")
async def chat(message: str = Form(...)):
    try:
        # Log the incoming message
        logger.info(f"Received message: {message}")
        
        # Log the API key (first few characters only, for debugging)
        api_key = os.getenv("OPENAI_API_KEY")
        logger.info(f"API Key exists: {bool(api_key)}")
        logger.info(f"API Key starts with: {api_key[:5]}..." if api_key else "No API key found!")

        # Log before API call
        logger.info("Attempting to call OpenAI API...")
        
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "user", "content": message}
            ]
        )

        # Log successful response
        logger.info("OpenAI API call successful")
        
        return JSONResponse(content={
            "response": response.choices[0].message.content
        })
    except Exception as e:
        logger.error(f"Error calling OpenAI API: {str(e)}")
        # Log the full exception details
        logger.exception("Full exception details:")
        return JSONResponse(content={"error": str(e)}, status_code=500)

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)