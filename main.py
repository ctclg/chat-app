from fastapi import FastAPI, Request, Form
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
import os
from dotenv import load_dotenv
import logging
import sys

# Configure logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

# Log startup information
logger.info("Starting application...")
logger.info(f"Python version: {sys.version}")
logger.info(f"Current working directory: {os.getcwd()}")

# Load environment variables
load_dotenv(verbose=True)
logger.info("Environment variables loaded")

# Initialize FastAPI app
app = FastAPI()
logger.info("FastAPI app initialized")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
logger.info("CORS middleware added")

# Mount static files
try:
    app.mount("/static", StaticFiles(directory="static"), name="static")
    logger.info("Static files mounted successfully")
except Exception as e:
    logger.error(f"Error mounting static files: {str(e)}")

# Templates
try:
    templates = Jinja2Templates(directory="templates")
    logger.info("Templates initialized successfully")
except Exception as e:
    logger.error(f"Error initializing templates: {str(e)}")

# Initialize OpenAI client
api_key = os.getenv("OPENAI_API_KEY")
if not api_key:
    logger.error("OPENAI_API_KEY not found in environment variables")
else:
    logger.info("OPENAI_API_KEY found")
client = OpenAI(api_key=api_key)

@app.get("/")
async def root(request: Request):
    logger.info("Handling root request")
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/health")
async def health_check():
    logger.info("Health check endpoint called")
    return {
        "status": "healthy",
        "python_version": sys.version,
        "current_directory": os.getcwd(),
        "environment_variables": list(os.environ.keys())
    }

@app.on_event("startup")
async def startup_event():
    logger.info("Application startup event triggered")
    # Log all environment variables (excluding sensitive ones)
    env_vars = {k: v for k, v in os.environ.items() if 'key' not in k.lower() and 'password' not in k.lower()}
    logger.info(f"Environment variables: {env_vars}")

@app.get("/")
async def root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.post("/chat")
async def chat(message: str = Form(...)):
    try:
        # Check if API key is available
        if not os.getenv("OPENAI_API_KEY"):
            return JSONResponse(
                content={"error": "OpenAI API key not found in environment variables"},
                status_code=500
            )

        # Make the API call
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "user", "content": message}
            ]
        )
        
        # Return the response
        return JSONResponse(content={
            "response": response.choices[0].message.content
        })
    except Exception as e:
        print(f"Error in chat endpoint: {str(e)}")  # Server-side logging
        return JSONResponse(
            content={"error": f"An error occurred: {str(e)}"},
            status_code=500
        )
    
if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)