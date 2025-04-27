#main.py
#start with: uvicorn main:app --host 0.0.0.0 --port 8001 --reload
#see docs: http://127.0.0.1:8001/docs

import json, logging, openai, os, re, secrets, uuid, anthropic, asyncio
from azure.cosmos import CosmosClient, PartitionKey, exceptions
from datetime import datetime, timedelta
from dotenv import load_dotenv
from fastapi import FastAPI, Request, Form, HTTPException, Depends, status, APIRouter, BackgroundTasks, APIRouter, Query, Body
from fastapi_mail import FastMail, MessageSchema, ConnectionConfig
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse, FileResponse, HTMLResponse
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from google import genai
from google.genai import types
from jose import JWTError, jwt
from logging.handlers import RotatingFileHandler
from openai import OpenAI
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr
from typing import List, Optional, Dict, Any

# Create logs directory if it doesn't exist
if not os.path.exists('logs'):
    os.mkdir('logs')

# Configure logging
logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s %(levelname)s: %(message)s [in %(pathname)s:%(lineno)d]',
                    handlers=[RotatingFileHandler('logs/myapp.log', maxBytes=10240, backupCount=10)])

logger = logging.getLogger(__name__)

class Message(BaseModel):
    role: str
    content: str
    timestamp: str
    model: Optional[str] = None

class Conversation(BaseModel):
    name: str
    folder: str
    messages: List[Message]

class ChatSettings(BaseModel):
    system_prompt: str
    model: str
    temperature: float
    max_tokens: int

class UserRegistration(BaseModel):
    email: EmailStr

class EmailVerificationToken(BaseModel):
    token: str
    email: EmailStr

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

class DeleteAccountRequest(BaseModel):
    token: str

class SettingsResponse(BaseModel):
    model: str
    system_prompt_supported: str
    system_prompt: str
    temperature: float
    max_tokens: int

class SetPasswordRequest(BaseModel):
    token: str
    password: str

load_dotenv(override=True)
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

environment = os.getenv("ENVIRONMENT")
logger.info("environment: " + environment)

openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
anthropic_client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"),)
deepseek_client = OpenAI(api_key=os.getenv("DEEPSEEK_API_KEY"), base_url=os.getenv("DEEPSEEK_URL"))
google_client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
llama_client = OpenAI(api_key=os.getenv("LLAMA_API_KEY"), base_url=os.getenv("LLAMA_URL"))

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Cosmos DB setup
cosmos_client = CosmosClient.from_connection_string(os.getenv("COSMOS_CONNECTION_STRING"))
database = cosmos_client.get_database_client("chat_app")
usercontainer = database.get_container_client("users")
conversationcontainer = database.get_container_client("conversations")
tokencontainer = database.get_container_client("tokens")
modelcontainer = database.get_container_client("models")
systemmessagescontainer = database.get_container_client("system messages")

# JWT Configuration
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise ValueError("No SECRET_KEY set in environment variables")
ALGORITHM = os.getenv("ALGORITHM")
if not ALGORITHM:
    raise ValueError("No ALGORITHM set in environment variables")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES"))
if not ACCESS_TOKEN_EXPIRE_MINUTES:
    raise ValueError("No ACCESS_TOKEN_EXPIRE_MINUTES set in environment variables")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/token")

# Configuration for sending emails
conf = ConnectionConfig(
    MAIL_USERNAME = os.getenv("MAIL_USERNAME"),
    MAIL_PASSWORD = os.getenv("MAIL_PASSWORD"),
    MAIL_FROM = os.getenv("MAIL_FROM"),
    MAIL_FROM_NAME = os.getenv("MAIL_FROM_NAME"),
    MAIL_PORT = int(os.getenv("MAIL_PORT")),
    MAIL_SERVER = os.getenv("MAIL_SERVER"),
    MAIL_STARTTLS = os.getenv("MAIL_STARTTLS"),
    MAIL_SSL_TLS = os.getenv("MAIL_SSL_TLS"),
    USE_CREDENTIALS = os.getenv("USE_CREDENTIALS"),
    VALIDATE_CERTS=os.getenv("VALIDATE_CERTS"),
    TEMPLATE_FOLDER = os.getenv("TEMPLATE_FOLDER") #Path(__file__).parent / 'templates'
)

fast_mail = FastMail(conf)

async def send_verification_email(email: str, verification_token: str):
    subject = "Email Verification for Predictum IT ChatApp"
    # Use your actual frontend URL
    verification_url = f"{os.getenv('FRONTEND_URL')}/verify?token={verification_token}"
    
    message = f"""
    Please verify your email address by clicking the link below:
    
    {verification_url}
    
    This link will expire in 1 hour.

    If you didn't request this verification, please ignore this email.
    """
    
    message_obj = MessageSchema(
        subject=subject,
        recipients=[email],
        body=message,
        subtype="plain"
    )

    await fast_mail.send_message(message=message_obj)

@app.get("/settings")
async def get_settings():
    settings = {
        "model": os.getenv("MODEL"),
        "system_prompt_supported": os.getenv("SYSTEM_PROMPT_SUPPORTED"),
        "system_prompt": os.getenv("SYSTEM_PROMPT"),
        "temperature": float(os.getenv("TEMPERATURE")),
        "max_tokens": int(os.getenv("MAX_TOKENS"))
    }
    return JSONResponse(content=settings)

# Helper functions for authentication
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# Get current user
async def get_current_user(token: str = Depends(oauth2_scheme)):
    logger.info("=== Token Validation ===")
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        logger.info("Attempting to decode token")
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        logger.info(f"Token decoded successfully for email: {email}")
        
        if email is None:
            logger.error("No email in token payload")
            raise credentials_exception

        # Query user from database
        query = "SELECT * FROM c WHERE c.email = @email AND c.type = 'user'"
        parameters = [{"name": "@email", "value": email}]
        
        users = list(usercontainer.query_items(
            query=query,
            parameters=parameters,
            enable_cross_partition_query=True
        ))

        if not users:
            logger.error("User not found in database")
            raise credentials_exception

        logger.info("User authenticated successfully")
        logger.info("=== Token Validation Complete ===")
        return users[0]

    except JWTError as e:
        logger.error(f"JWT Error: {str(e)}")
        raise credentials_exception
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        raise credentials_exception

# Home page
@app.get("/")
async def root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

# Login endpoint
@app.post("/api/token")
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends()):
    logger.info("="*50)
    logger.info("LOGIN ATTEMPT")
    logger.info(f"Username provided: {form_data.username}")
    
    try:
        # Query user from database
        query = "SELECT * FROM c WHERE c.email = @email AND c.type = 'user'"
        parameters = [{"name": "@email", "value": form_data.username}]
        
        logger.info("Querying database for user")
        users = list(usercontainer.query_items(
            query=query,
            parameters=parameters,
            enable_cross_partition_query=True
        ))
        
        logger.info(f"Found {len(users)} matching users")

        if not users:
            logger.error("No user found with provided email")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # Verify password
        is_password_correct = pwd_context.verify(form_data.password, users[0]["password_hash"])
        logger.info(f"Password verification result: {is_password_correct}")

        if not is_password_correct:
            logger.error("Invalid password")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password",
                headers={"WWW-Authenticate": "Bearer"},
            )

        user = users[0]
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": user["email"]}, 
            expires_delta=access_token_expires
        )
        
        logger.info(f"Login successful for user: {user['email']}")
        logger.info("="*50)
        
        return {"access_token": access_token, "token_type": "bearer"}
        
    except Exception as e:
        logger.error(f"Login error: {str(e)}")
        logger.info("="*50)
        raise

# Register user
@app.post("/api/register")
async def register(user: UserRegistration):
    logger.info(f"Registration attempt for email: {user.email}")
    
    try:
        # Check if user already exists
        query = "SELECT * FROM c WHERE c.email = @email"
        parameters = [{"name": "@email", "value": user.email}]
        existing_users = list(usercontainer.query_items(
            query=query,
            parameters=parameters,
            enable_cross_partition_query=True
        ))

        if existing_users:
            raise HTTPException(status_code=400, detail="Email already registered")

        # Generate a unique verification token
        verification_token = secrets.token_urlsafe(16)
        
        # Store token in Cosmos DB with expiration time
        token_doc = {
            "id": verification_token,
            "email": user.email,
            "type": "verification_token",
            "created_at": datetime.utcnow().isoformat(),
            "expires_at": (datetime.utcnow() + timedelta(hours=1)).isoformat()
        }
        tokencontainer.create_item(body=token_doc)

        # Send email with verification link
        await send_verification_email(user.email, verification_token)

        return {"message": "Email verification sent"}

    except Exception as e:
        logger.error(f"Registration error for {user.email}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="An error occurred during registration. Please try again."
        )

# Delete user
@app.post("/api/request-delete-account")
async def request_delete_account(user: UserRegistration):
    logger.info(f"Deletion attempt for email: {user.email}")
    
    try:
        # Check if user exists
        query = "SELECT * FROM c WHERE c.email = @email"
        parameters = [{"name": "@email", "value": user.email}]
        existing_users = list(usercontainer.query_items(
            query=query,
            parameters=parameters,
            enable_cross_partition_query=True
        ))

        if not existing_users:
            raise HTTPException(status_code=400, detail="Email for the account not found")

        # Generate a unique verification token
        deletion_token = secrets.token_urlsafe(16)
        
        # Store token in Cosmos DB with expiration time
        token_doc = {
            "id": deletion_token,
            "email": user.email,
            "type": "deletion_token",
            "created_at": datetime.utcnow().isoformat(),
            "expires_at": (datetime.utcnow() + timedelta(hours=1)).isoformat()
        }
        tokencontainer.create_item(body=token_doc)

        # Send email with verification link
        await send_delete_account_email(user.email, deletion_token)

        return {"message": "Email verification sent"}

    except Exception as e:
        logger.error(f"Deletion error for {user.email}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="An error occurred during deletion. Please try again."
        )
        
@app.post("/api/request-reset-password")
async def request_reset_password(email: str):
    logger.info(f"Password reset requested for email: {email}")
    user = get_user_by_email(email)
    
    if user:
        reset_token = secrets.token_urlsafe(16)
        
        # Store reset token in Cosmos DB
        token_doc = {
            "id": reset_token,
            "email": email,
            "type": "reset_token",
            "created_at": datetime.utcnow().isoformat(),
            "expires_at": (datetime.utcnow() + timedelta(hours=1)).isoformat()
        }
        
        try:
            tokencontainer.create_item(body=token_doc)
            # Send reset password email with the token
            await send_reset_password_email(email, reset_token)
            return {"message": "Reset password email sent. Check your mail!"}
        except Exception as e:
            logger.error(f"Error creating reset token: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail="Error processing password reset request"
            )
    else:
        raise HTTPException(status_code=404, detail="User not found")

@app.get("/reset-password")
async def reset_password_page(request: Request, token: str = Query(...)):
    try:
        # Query token from Cosmos DB
        query = "SELECT * FROM c WHERE c.id = @token AND c.type = 'reset_token'"
        parameters = [{"name": "@token", "value": token}]
        
        tokens = list(tokencontainer.query_items(
            query=query,
            parameters=parameters,
            enable_cross_partition_query=True
        ))
        
        if not tokens:
            return templates.TemplateResponse("error.html", {
                "request": request,
                "message": "This password reset link is invalid. Please request a new password reset."
            })
            
        token_doc = tokens[0]
        
        # Check if token has expired
        expires_at = datetime.fromisoformat(token_doc['expires_at'])
        if datetime.utcnow() > expires_at:
            return templates.TemplateResponse("error.html", {
                "request": request,
                "message": "This password reset link has expired. Please request a new password reset."
            })
            
        return templates.TemplateResponse("reset_password.html", {
            "request": request,
            "token": token
        })
    except Exception as e:
        logger.error(f"Error verifying reset token: {str(e)}")
        return templates.TemplateResponse("error.html", {
            "request": request,
            "message": "An error occurred. Please try again or request a new password reset."
        })

@app.get("/delete-account")
async def delete_account_page(request: Request, token: str = Query(...)):
    try:
        # Query token from Cosmos DB
        query = "SELECT * FROM c WHERE c.id = @token AND c.type = 'deletion_token'"
        parameters = [{"name": "@token", "value": token}]
        logger.info(f"Querying token: {token}")
        tokens = list(tokencontainer.query_items(
            query=query,
            parameters=parameters,
            enable_cross_partition_query=True
        ))
        
        if not tokens:
            return templates.TemplateResponse("error.html", {
                "request": request,
                "message": "This link is invalid. Please request the deletion of your account again."
            })
            
        token_doc = tokens[0]
        
        # Check if token has expired
        expires_at = datetime.fromisoformat(token_doc['expires_at'])
        if datetime.utcnow() > expires_at:
            return templates.TemplateResponse("error.html", {
                "request": request,
                "message": "This link has expired. Please request the deletion of your account reset."
            })
            
        return templates.TemplateResponse("delete_account.html", {
            "request": request,
            "token": token
        })
    except Exception as e:
        logger.error(f"Error verifying token: {str(e)}")
        return templates.TemplateResponse("error.html", {
            "request": request,
            "message": "An error occurred. Please try again or make the request again."
        })

@app.post("/api/reset-password")
async def reset_password(request: ResetPasswordRequest):
    try:
        # Query token from Cosmos DB
        query = "SELECT * FROM c WHERE c.id = @token AND c.type = 'reset_token'"
        parameters = [{"name": "@token", "value": request.token}]
        
        tokens = list(tokencontainer.query_items(
            query=query,
            parameters=parameters,
            enable_cross_partition_query=True
        ))
        
        if not tokens:
            raise HTTPException(status_code=400, detail="Invalid reset token")
            
        token_doc = tokens[0]
        
        # Check if token has expired
        expires_at = datetime.fromisoformat(token_doc['expires_at'])
        if datetime.utcnow() > expires_at:
            raise HTTPException(status_code=400, detail="Reset token has expired")

        email = token_doc['email']
        
        # Hash the new password
        hashed_password = pwd_context.hash(request.new_password)
        
        # Update the user's password in the database
        update_user_password(email, hashed_password)
        
        # Delete the used token
        tokencontainer.delete_item(item=token_doc['id'], partition_key=token_doc['id'])
        
        return {"message": "Password reset successful. Now you can login again!"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error resetting password: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="An error occurred while resetting the password"
        )

@app.post("/api/delete-account")
async def delete_account(request: DeleteAccountRequest):
    logger.info(f"Delete account request for token: {request.token}")
    try:
        # Query token from Cosmos DB
        query = "SELECT * FROM c WHERE c.id = @token AND c.type = 'deletion_token'"
        parameters = [{"name": "@token", "value": request.token}]
        
        tokens = list(tokencontainer.query_items(
            query=query,
            parameters=parameters,
            enable_cross_partition_query=True
        ))
        
        if not tokens:
            raise HTTPException(status_code=400, detail="Invalid reset token")
            
        token_doc = tokens[0]
        
        # Check if token has expired
        expires_at = datetime.fromisoformat(token_doc['expires_at'])
        if datetime.utcnow() > expires_at:
            raise HTTPException(status_code=400, detail="Reset token has expired")

        email = token_doc['email']
        
        # Delete the user from the database
        delete_user(email)
        
        # Delete the used token
        tokencontainer.delete_item(item=token_doc['id'], partition_key=token_doc['id'])
        
        return {"message": "Your account has been deleted successfully."}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting account: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="An error occurred while deleting the account"
        )

async def send_reset_password_email(email: str, reset_token: str):
    subject = "Reset Your Password for Predictum IT ChatApp"
    reset_url = f"{os.getenv('FRONTEND_URL')}/reset-password?token={reset_token}"  # Update with your actual reset password URL
    
    message = f"""
    Please click the following link to reset your password:
    
    {reset_url}
    
    This link will expire in 1 hour.

    If you didn't request a password reset, please ignore this email.
    """

    message_obj = MessageSchema(
        subject=subject,
        recipients=[email],
        body=message,
        subtype="plain"
    )

    await fast_mail.send_message(message=message_obj)

async def send_delete_account_email(email: str, deletion_token: str):
    subject = "Delete your account for Predictum IT ChatApp"
    delete_account_url = f"{os.getenv('FRONTEND_URL')}/delete-account?token={deletion_token}" 
    
    message = f"""
    Please click the following link to delete your account permanently:
    
    {delete_account_url}
    
    This link will expire in 1 hour.

    If you didn't request to delete your account, please ignore this email.
    """

    message_obj = MessageSchema(
        subject=subject,
        recipients=[email],
        body=message,
        subtype="plain"
    )

    await fast_mail.send_message(message=message_obj)

def update_user_password(email: str, new_password: str):
    query = "SELECT * FROM c WHERE c.email = @email"
    parameters = [{"name": "@email", "value": email}]
    
    users = list(usercontainer.query_items(
        query=query,
        parameters=parameters,
        enable_cross_partition_query=True
    ))
    
    if users:
        user = users[0]
        user["password_hash"] = new_password
        
        # Update the user document in the database
        usercontainer.replace_item(item=user, body=user)
    else:
        raise Exception("User not found")

def delete_user(email: str):
    # First find the user
    query = "SELECT * FROM c WHERE c.email = @email"
    parameters = [{"name": "@email", "value": email}]
    
    users = list(usercontainer.query_items(
        query=query,
        parameters=parameters,
        enable_cross_partition_query=True
    ))
    
    if users:
        user = users[0]
        user_id = user["id"]
        logger.info(f"Deleting user with ID: {user_id}")

        # Get all conversations associated with this user
        conv_query = "SELECT * FROM c WHERE c.user_id = @user_id"
        conv_parameters = [{"name": "@user_id", "value": user_id}]
        
        conversations = list(conversationcontainer.query_items(
            query=conv_query,
            parameters=conv_parameters,
            enable_cross_partition_query=True
        ))
        logger.info(f"Found {len(conversations)} conversations to delete")

        # Delete conversations
        for conversation in conversations:
            logger.info(f"Deleting conversation: {conversation['id']}")
            conversationcontainer.delete_item(
                item=conversation, 
                partition_key=f'CHAT#{user_id}'
            )

        # Finally delete the user
        usercontainer.delete_item(
            item=user, 
            partition_key=f'USER#{user_id}'
        )
    else:
        raise Exception("User not found")
    
def get_user_by_email(email: str):
    query = "SELECT * FROM c WHERE c.email = @email"
    parameters = [{"name": "@email", "value": email}]
    
    users = list(usercontainer.query_items(
        query=query,
        parameters=parameters,
        enable_cross_partition_query=True
    ))
    
    if users:
        return users[0]
    else:
        return None

async def cleanup_expired_tokens():
    while True:
        try:
            current_time = datetime.utcnow().isoformat()
            query = "SELECT * FROM c WHERE c.expires_at < @current_time"
            parameters = [{"name": "@current_time", "value": current_time}]
            
            expired_tokens = list(tokencontainer.query_items(
                query=query,
                parameters=parameters,
                enable_cross_partition_query=True
            ))
            
            for token in expired_tokens:
                tokencontainer.delete_item(item=token['id'], partition_key=token['id'])
                
            await asyncio.sleep(3600)  # Run every hour
            
        except Exception as e:
            logger.error(f"Error cleaning up expired tokens: {str(e)}")
            await asyncio.sleep(300)  # Wait 5 minutes before retrying if there's an error

# Get current user
@app.get("/api/users/me")
async def read_users_me(current_user = Depends(get_current_user)):
    return {
        "email": current_user["email"],
        "id": current_user["id"]
    }

# Middleware to authenticate requests
@app.middleware("http")
async def authenticate_requests(request: Request, call_next):
    # Allow access to register, token endpoints, and static assets
    public_paths = [
        "/static/",
        "/api/register",
        "/api/token"
    ]

    if any(request.url.path.startswith(path) for path in public_paths):
        return await call_next(request)

    # Check for token in protected routes
    if request.url.path.startswith("/static/"):
        token = request.cookies.get("token")
        if not token:
            return RedirectResponse(url="/static/login.html")
        
        try:
            # Verify token
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            # If valid, continue with the request
            return await call_next(request)
        except JWTError:
            return RedirectResponse(url="/static/login.html")

    return await call_next(request)

@app.get("/verify")
async def verify_email_page(request: Request, token: str = Query(...)):
    try:
        # Query token from Cosmos DB
        query = "SELECT * FROM c WHERE c.id = @token AND c.type = 'verification_token'"
        parameters = [{"name": "@token", "value": token}]
        
        tokens = list(tokencontainer.query_items(
            query=query,
            parameters=parameters,
            enable_cross_partition_query=True
        ))
        
        if not tokens:
            # Return an error page instead of throwing an exception
            return templates.TemplateResponse("error.html", {
                "request": request,
                "message": "This verification link is invalid. Please request a new verification email."
            })
            
        token_doc = tokens[0]
        
        # Check if token has expired
        expires_at = datetime.fromisoformat(token_doc['expires_at'])
        if datetime.utcnow() > expires_at:
            # Return an error page for expired token
            return templates.TemplateResponse("error.html", {
                "request": request,
                "message": "This verification link has expired. Please request a new verification email."
            })
            
        return templates.TemplateResponse("set_password.html", {
            "request": request,
            "token": token
        })
    except Exception as e:
        logger.error(f"Error verifying token: {str(e)}")
        return templates.TemplateResponse("error.html", {
            "request": request,
            "message": "An error occurred. Please try again or request a new verification email."
        })

@app.post("/api/set-password")
async def set_password(request: SetPasswordRequest):
    try:
        # Query token from Cosmos DB
        query = "SELECT * FROM c WHERE c.id = @token AND c.type = 'verification_token'"
        parameters = [{"name": "@token", "value": request.token}]
        
        tokens = list(tokencontainer.query_items(
            query=query,
            parameters=parameters,
            enable_cross_partition_query=True
        ))
        
        if not tokens:
            raise HTTPException(status_code=400, detail="Invalid verification token")
            
        token_doc = tokens[0]
        
        # Check if token has expired
        expires_at = datetime.fromisoformat(token_doc['expires_at'])
        if datetime.utcnow() > expires_at:
            raise HTTPException(status_code=400, detail="Verification token has expired")

        email = token_doc['email']
        
        # Hash the password
        hashed_password = pwd_context.hash(request.password)
        user_id = str(uuid.uuid4())

        # Create user document
        user_doc = {
            "id": user_id,
            'partitionKey': f'USER#{user_id}',
            "type": "user",
            "email": email,
            "password_hash": hashed_password,
            'is_active': True,
            "verified": True,
            "created_at": datetime.utcnow().isoformat()
        }
        
        # Save to database
        usercontainer.create_item(body=user_doc)
        
        # Delete the used token from Cosmos DB
        tokencontainer.delete_item(item=token_doc['id'], partition_key=token_doc['id'])
        
        return {"message": "Password set successfully. You are now able to login!"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error setting password: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="An error occurred while setting the password"
        )

# Chat endpoint
@app.post("/chat")
async def chat(
    message: str = Form(...), 
    conversation: str = Form(default="[]"), 
    model: str = Form(...),
    temperature: float = Form(...),
    max_tokens: int = Form(...),
    system_prompt: str = Form(...)
):
    try:
        logger.info(f"Received message: {message}")
        
        # Parse conversation JSON string to list
        try:
            conversation_list = json.loads(conversation)
        except json.JSONDecodeError:
            conversation_list = []
        
        # Prepare messages for API call
        messages = []
        messages.extend(conversation_list)
        messages.append({"role": "user", "content": message})
        logger.info(f"conversation_list: {conversation_list}")
        logger.info(f"messages: {messages}")

        selectedmodel = model
        logger.info(f"Selected model: {model}")

        for message in messages:
            if 'timestamp' in message:
                del message['timestamp']
            if 'model' in message:
                del message['model']
        logger.info(f"Final message: {messages}")

        if "gemini" in selectedmodel.lower():
            logger.info(f"gemini messages: {messages}")
            try:
                # Format everything as a single prompt
                prompt = ""

                # Add system prompt if provided
                if system_prompt and system_prompt.strip():
                    prompt += f"System: {system_prompt}\n\n"

                # Add conversation history
                # Iterate to the second to last message, i.e. skip the newest user message
                for i in range(len(messages) - 1):
                    msg = messages[i]
                    role = "User" if msg["role"] == "user" else "Assistant"
                    prompt += f"{role}: {msg['content']}\n\n"

                # Add the current query
                prompt += f"User: {message}\n\nAssistant:"

                logger.info(f"Gemini prompt: {prompt}")

                # Generate content with minimal parameters
                response = google_client.models.generate_content(
                    model=selectedmodel,
                    contents=prompt
                )

                logger.info(f"Gemini response: {response}")

                return JSONResponse(content={
                    "response": response.text
                })
            except Exception as e:
                logger.error(f"Error with Gemini API: {str(e)}")
                logger.exception("Full Gemini exception details:")
                return JSONResponse(content={"error": str(e)}, status_code=500)
            
        # o1-mini only support the value 1 in the temperature parameter, and max_token is max_completion_tokens
        if "-mini" in selectedmodel.lower():
            messages.pop(0) #Remove the first item in the list, as o1 does not accept the system role
            messages.pop() #Remove the last item in the list, because it is duplicate for some reason
            logger.info(f"o1-mini messages: {messages}")
            response = openai_client.chat.completions.create(
                model=selectedmodel, 
                messages=messages,
                temperature=1,
                max_completion_tokens=max_tokens
            )
            logger.info(f"o1-mini response: {response}")
            return JSONResponse(content={
                "response": response.choices[0].message.content
                })

        # o1-preview does not support the temperature parameter, and max_token is max_completion_tokens
        if "o1" in selectedmodel.lower():
            messages.pop(0) #Remove the first item in the list, as o1 does not accept the system role
            messages.pop() #Remove the last item in the list, because it is duplicate for some reason
            logger.info(f"o1-preview messages: {messages}")
            response = openai_client.chat.completions.create(
                model=selectedmodel, 
                messages=messages,
                max_completion_tokens=max_tokens
            )
            logger.info(f"o1-preview response: {response}")
            return JSONResponse(content={
                "response": response.choices[0].message.content
                })

        if "gpt" in selectedmodel.lower():
            messages.pop() #Remove the last item in the list, because it is duplicated
            logger.info(f"gpt messages: {messages}")
            response = openai_client.chat.completions.create(
                model=selectedmodel, 
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens
            )
            logger.info(f"gpt response: {response}")
            return JSONResponse(content={
                "response": response.choices[0].message.content
                })

        if "deepseek" in selectedmodel.lower():
            logger.info(f"deepseek messages: {messages}")
            messages.pop() #Remove the last item in the list, because it is duplicated
            logger.info(f"deepseek messages: {messages}")
            response = deepseek_client.chat.completions.create(
                model=selectedmodel, 
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens
            )
            logger.info(f"deepseek response: {response}")
            return JSONResponse(content={
                "response": response.choices[0].message.content
                })

        if "llama" in selectedmodel.lower():
            logger.info(f"llama messages: {messages}")
            messages.pop() #Remove the last item in the list, because it is duplicated
            logger.info(f"llama messages: {messages}")
            response = llama_client.chat.completions.create(
                model=selectedmodel, 
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens
            )
            logger.info(f"llama response: {response}")
            return JSONResponse(content={
                "response": response.choices[0].message.content
                })

        if "claude" in selectedmodel.lower():
            messages.pop(0) #Remove the first item in the list, as claude does not accept the system role
            messages.pop() #Remove the last item in the list, because it is duplicated
            logger.info(f"claude messages: {messages}")
            response = anthropic_client.messages.create(
                model=selectedmodel, 
                messages=messages, 
                system=system_prompt,
                temperature=temperature,
                max_tokens=max_tokens
            )
            logger.info(f"claud response: {response}")
            return JSONResponse(content={
                "response": response.content[0].text
                })

    except Exception as e:
        logger.error(f"Error calling LLM API: {str(e)}")
        logger.exception("Full exception details:")
        return JSONResponse(content={"error": str(e)}, status_code=500)

# Define a function to get models from CosmosDB
async def get_models_from_cosmos():
    try:
        # Query for models that should be shown in production
        if environment == "development":
            query = "SELECT * FROM c WHERE c.type = 'llm_model' order by c.vendor, c.label"            
        else:
            query = "SELECT * FROM c WHERE c.type = 'llm_model' AND c.show_in_prod = 'Yes' order by c.vendor, c.label"
        logger.info(query)
        items = list(modelcontainer.query_items(
            query=query,
            enable_cross_partition_query=True
        ))
        
        # Sort models if needed (optional)
        # items.sort(key=lambda x: x.get('label', ''))
        
        return items
    except exceptions.CosmosHttpResponseError as e:
        logger.error(f"CosmosDB error: {str(e)}")
        return []
    except Exception as e:
        logger.error(f"Error retrieving models from CosmosDB: {str(e)}")
        return []

# Update the existing endpoint
@app.get("/api/models")
async def get_models():
    try:
        models = await get_models_from_cosmos()
        logger.info(f"Retrieved {len(models)} models from CosmosDB")
        
        # Remove internal fields that shouldn't be exposed to the client
        for model in models:
            # Remove CosmosDB system properties
            for key in ['_rid', '_self', '_etag', '_attachments', '_ts']:
                if key in model:
                    del model[key]
                    
        return models
    except Exception as e:
        logger.error(f"Error in get_models: {str(e)}")
        # Fallback to environment variable if CosmosDB fails
        models_json = os.getenv("AVAILABLE_MODELS", "[]")
        models = json.loads(models_json)
        logger.info(f"Falling back to env var models: {models}")
        return models

# Save conversation
@app.post("/api/conversations")
async def save_conversation(
    conversation: Conversation,
    current_user = Depends(get_current_user)
):
    try:
        conversation_doc = {
            'id': str(uuid.uuid4()),
            'partitionKey': f'CHAT#{current_user["id"]}',
            'type': 'conversation',
            'user_id': current_user["id"],
            'name': conversation.name,
            'folder': conversation.folder,
            'messages': [msg.dict() for msg in conversation.messages],
            'created_at': datetime.utcnow().isoformat(),
            'updated_at': datetime.utcnow().isoformat()
        }
        
        result = conversationcontainer.create_item(body=conversation_doc)
        return result

    except Exception as e:
        logger.error(f"Error saving conversation: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Failed to save conversation"
        )

# Update conversation
@app.put("/api/conversations/{conversation_id}")
async def update_conversation(
    conversation_id: str,
    conversation: Conversation,
    current_user = Depends(get_current_user)
):
    partition_key = f'CHAT#{current_user["id"]}'        
    # Read existing conversation
    try:
        existing = conversationcontainer.read_item( 
            item=conversation_id,
            partition_key=partition_key
        )
    except Exception as e:
        logger.error(f"Error reading existing conversation: {str(e)}")
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Check if name or folder has changed
    if existing.get('name') != conversation.name or existing.get('folder') != conversation.folder:
        # Create as new conversation
        try:
            conversation_doc = {
                'id': str(uuid.uuid4()),
                'partitionKey': partition_key,
                'type': 'conversation',
                'user_id': current_user["id"],
                'name': conversation.name,
                'folder': conversation.folder,
                'messages': [msg.dict() for msg in conversation.messages],
                'created_at': datetime.utcnow().isoformat(),
                'updated_at': datetime.utcnow().isoformat()
            }
            result = conversationcontainer.create_item(body=conversation_doc)
            logger.info(f"Update successful.")
            return result
            
        except Exception as e:
            logger.error(f"Error during replace_item: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to update conversation: {str(e)}"
            )
    else:
        # Replace the document
        try:
            conversation_doc = {
                'id': conversation_id,
                'partitionKey': partition_key,
                'type': 'conversation',
                'user_id': current_user["id"],
                'name': conversation.name,
                'folder': conversation.folder,
                'messages': [msg.dict() for msg in conversation.messages],
                'created_at': existing.get('created_at'),
                'updated_at': datetime.utcnow().isoformat()
            }
            result = conversationcontainer.replace_item( 
                item=conversation_id,
                body=conversation_doc
            )
            logger.info(f"Update successful.")
            return result
            
        except Exception as e:
            logger.error(f"Error during replace_item: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to update conversation: {str(e)}"
            )

@app.put("/api/publish-conversation/{conversation_id}")
async def publish_conversation(
    conversation_id: str,
    request: dict,
    current_user = Depends(get_current_user)
):
    try:
        # Check if conversation exists
        partition_key = f'CHAT#{current_user["id"]}'
        conversation = conversationcontainer.read_item(
            item=conversation_id,
            partition_key=partition_key
        )
        
        conversation['published'] = request['published']
        conversation['magiclink'] = request['magiclink']
        conversation['published_at'] = datetime.utcnow().isoformat()
        
        result = conversationcontainer.replace_item(
            item=conversation_id,
            body=conversation
        )
        
        return result

    except Exception as e:
        logger.error(f"Error publishing conversation: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Failed to publish conversation"
        )

# Serve public conversation page
@app.get("/public-conversation/{conversation_id}", response_class=HTMLResponse)
async def get_public_conversation_page(request: Request, conversation_id: str):
    """
    Serves the HTML page for displaying a conversation.
    """
    try:
        # You might want to validate here that the conversation exists and is published
        # before serving the page, to avoid showing the page for unauthorized conversations.
        # However, you can also handle this in the JavaScript code in the HTML page.

        return templates.TemplateResponse(
            "conversation.html",  # Or whatever you name your HTML file
            {"request": request, "conversation_id": conversation_id}
        )
    except Exception as e:
        print(f"An error occurred: {e}")
        raise HTTPException(status_code=500, detail="Internal server error.")

# Get public conversation
@app.get("/api/public-conversations/{conversation_id}")
async def get_public_conversation(
    conversation_id: str
):

    try:
        query = f"SELECT * FROM c WHERE c.id = @id and c.type = 'conversation' and c.published = true"
        parameters = [
            {"name": "@id", "value": conversation_id}
        ]
        conversation = list(conversationcontainer.query_items(
            query=query,
            parameters=parameters,
            enable_cross_partition_query=True
        ))

        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found or not published.")

        return conversation

    except Exception as e:
        logger.error(f"Error retrieving conversation: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve conversation: {str(e)}"
        )

# Delete conversation
@app.delete("/api/conversations/{conversation_id}")
async def delete_conversation(
    conversation_id: str,
    current_user = Depends(get_current_user)
):
    try:
        partition_key = f'CHAT#{current_user["id"]}'
        conversationcontainer.delete_item(
            item=conversation_id,
            partition_key=partition_key
        )
        return {"message": "Conversation deleted successfully"}

    except Exception as e:
        logger.error(f"Error deleting conversation: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Failed to delete conversation"
        )
 
# Get conversation
@app.get("/api/conversation/{conversation_id}")
async def get_conversation(
    conversation_id: str,
    current_user = Depends(get_current_user)
):
    try:
        #c.id, c.partitionKey, c.user_id, c.name, c.folder, c.created_at, c.updated_at, c.type,
        #c.messages, c._rid, c._self, c._etag, c._attachments, c._ts
        query = """
        SELECT c.messages
        FROM c
        WHERE c.type = 'conversation' 
        AND c.partitionKey = @partitionKey 
        AND c.id = @id
        ORDER BY c.created_at DESC
        """
        parameters = [
            {"name": "@partitionKey", "value": f'CHAT#{current_user["id"]}'},
            {"name": "@id", "value": conversation_id}
        ]
        logger.info(f"SQL:" + query)
        logger.info(f"Parameters:" + str(parameters))

        conversation = list(conversationcontainer.query_items(
            query=query,
            parameters=parameters,
            enable_cross_partition_query=True
        ))
        logger.info(f"Conversation: {conversation}")

        return conversation

    except Exception as e:
        logger.error(f"Error retrieving conversation: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Failed to retrieve conversation"
        )

# Get conversations
@app.get("/api/conversations")
async def get_conversations(current_user = Depends(get_current_user)):
    try:
        query = """
        SELECT 
         c.id, c.partitionKey, c.user_id, c.name, c.folder, c.published, c.magiclink,
         c.created_at, c.updated_at, c.type,
         c.id as messages, c._rid, c._self, c._etag, c._attachments, c._ts, ARRAY_LENGTH(
        ARRAY(
            SELECT VALUE m 
            FROM m IN c.messages 
            WHERE m.role != 'system'
        )
    ) as message_count
        FROM c
        WHERE c.type = 'conversation' 
        AND c.partitionKey = @partitionKey 
        ORDER BY c.created_at DESC
        """
        parameters = [
            {"name": "@partitionKey", "value": f'CHAT#{current_user["id"]}'}
        ]
        
        conversations = list(conversationcontainer.query_items(
            query=query,
            parameters=parameters,
            enable_cross_partition_query=True
        ))
        
        return conversations

    except Exception as e:
        logger.error(f"Error retrieving conversations: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Failed to retrieve conversations"
        )

# Get folders
@app.get("/api/folders")
async def get_folders(current_user = Depends(get_current_user)):
    try:
        query = """
        SELECT DISTINCT VALUE c.folder 
        FROM c 
        WHERE c.type = 'conversation' 
        AND c.partitionKey = @partitionKey
        """
        parameters = [
            {"name": "@partitionKey", "value": f'CHAT#{current_user["id"]}'}
        ]
        
        folders = list(conversationcontainer.query_items(
            query=query,
            parameters=parameters,
            enable_cross_partition_query=True
        ))
        
        return folders

    except Exception as e:
        logger.error(f"Error retrieving folders: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Failed to retrieve folders"
        )

@app.post("/api/conversations/search")
async def search_conversations(
    request: dict,
    current_user = Depends(get_current_user)
):
    try:
        search_term = request.get("query", "").strip().lower()
        
        if not search_term:
            raise HTTPException(
                status_code=400,
                detail="Search query cannot be empty"
            )
            
        # Get all conversations for this user
        query = """
        SELECT c.id, c.name, c.folder, c.updated_at, c.messages, c.partitionKey
        FROM c
        WHERE c.type = 'conversation'
        AND c.partitionKey = @partitionKey
        """
        
        parameters = [
            {"name": "@partitionKey", "value": f'CHAT#{current_user["id"]}'}
        ]
        
        conversations = list(conversationcontainer.query_items(
            query=query,
            parameters=parameters,
            enable_cross_partition_query=True
        ))
        
        # Process and filter results
        results = []
        for conv in conversations:
            matched = False
            matched_content = None
            highlighted_name = None
            highlighted_folder = None
            
            # Check name match
            conv_name = conv.get("name", "")
            if search_term in conv_name.lower():
                matched = True
                highlighted_name = highlight_text(conv_name, search_term)
            
            # Check folder match
            conv_folder = conv.get("folder", "")
            if search_term in conv_folder.lower():
                matched = True
                highlighted_folder = highlight_text(conv_folder, search_term)
            
            # Check message content match
            if not matched:
                for message in conv.get("messages", []):
                    content = message.get("content", "")
                    if search_term in content.lower():
                        matched = True
                        matched_content = extract_match_context(content, search_term)
                        break
            
            if matched:
                # Count messages (excluding system message)
                message_count = sum(1 for msg in conv.get("messages", []) 
                                  if msg.get("role") != "system")
                
                result = {
                    "id": conv.get("id"),
                    "name": conv.get("name"),
                    "folder": conv.get("folder"),
                    "updated_at": conv.get("updated_at"),
                    "message_count": message_count
                }
                
                # Add highlighted versions if available
                if highlighted_name:
                    result["highlightedName"] = highlighted_name
                if highlighted_folder:
                    result["highlightedFolder"] = highlighted_folder
                if matched_content:
                    result["matchedContent"] = highlight_text(matched_content, search_term)
                    
                results.append(result)
        
        # Sort results by updated_at (most recent first)
        results.sort(key=lambda x: x.get("updated_at", ""), reverse=True)
        
        # Return top 10 results
        return results[:10]

    except Exception as e:
        logger.error(f"Error searching conversations: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Failed to search conversations"
        )

def highlight_text(text: str, search_term: str) -> str:
    """Mark occurrences of search_term for highlighting"""
    if not text or not search_term:
        return text
        
    # Use case-insensitive replacement
    # Use a marker that's unlikely to appear in normal text
    pattern = re.compile(re.escape(search_term), re.IGNORECASE)
    highlighted = pattern.sub(r"%%%HIGHLIGHT%%%" + r"\g<0>" + r"%%%ENDHIGHLIGHT%%%", text)
    return highlighted

def extract_match_context(content: str, search_term: str, context_length: int = 80) -> str:
    """Extract a snippet of text around the search match for context"""
    # Make the search case-insensitive
    content_lower = content.lower()
    search_pos = content_lower.find(search_term.lower())
    if search_pos == -1:
        return None
        
    # Calculate start and end positions for the context
    start = max(0, search_pos - context_length)
    end = min(len(content), search_pos + len(search_term) + context_length)
    
    # Extract the context
    context = content[start:end]
    
    # Add ellipsis if we're not at the start/end of the content
    if start > 0:
        context = "..." + context
    if end < len(content):
        context = context + "..."
        
    return context

# Check if conversation exists
@app.post("/api/conversations/check")
async def check_conversation_exists(
    request: dict,
    current_user = Depends(get_current_user)
):
    try:
        query = """
        SELECT c.id
        FROM c
        WHERE c.type = 'conversation'
        AND c.partitionKey = @partitionKey
        AND c.name = @name
        AND c.folder = @folder
        """
        parameters = [
            {"name": "@partitionKey", "value": f'CHAT#{current_user["id"]}'},
            {"name": "@name", "value": request["name"]},
            {"name": "@folder", "value": request["folder"]}
        ]
        
        results = list(conversationcontainer.query_items(
            query=query,
            parameters=parameters,
            enable_cross_partition_query=True
        ))
        
        if results:
            return {"exists": True, "id": results[0]['id']}
        return {"exists": False, "id": None}

    except Exception as e:
        logger.error(f"Error checking conversation existence: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Failed to check conversation existence"
        )

@app.put("/api/rename-conversation/{conversation_id}")
async def rename_conversation(
    conversation_id: str,
    request: dict,
    current_user = Depends(get_current_user)
):
    try:
        # Check if conversation exists
        partition_key = f'CHAT#{current_user["id"]}'
        conversation = conversationcontainer.read_item(
            item=conversation_id,
            partition_key=partition_key
        )
        
        conversation['name'] = request['name']
        conversation['updated_at'] = datetime.utcnow().isoformat()
        
        result = conversationcontainer.replace_item(
            item=conversation_id,
            body=conversation
        )
        
        return result

    except Exception as e:
        logger.error(f"Error renaming conversation: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Failed to rename conversation"
        )

# Get system messages
@app.get("/api/system-messages", response_model=List[Dict[str, Any]])
async def get_system_messages():
    """Retrieve all active system messages, grouped by category."""
    try:
        # Query for all active system messages, ordered by category and displayOrder
        query = "SELECT * FROM c WHERE c.isActive = true ORDER BY c.category, c.displayOrder"
        items = list(systemmessagescontainer.query_items(
            query=query,
            enable_cross_partition_query=True
        ))
        return items
    except exceptions.CosmosHttpResponseError as e:
        logger.error(f"Error retrieving system messages: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.get("/api/system-messages/categories", response_model=List[str])
async def get_system_message_categories():
    """Retrieve all unique categories of system messages."""
    try:
        query = "SELECT DISTINCT c.category FROM c WHERE c.isActive = true ORDER BY c.category"
        items = list(systemmessagescontainer.query_items(
            query=query,
            enable_cross_partition_query=True
        ))
        return [item['category'] for item in items]
    except exceptions.CosmosHttpResponseError as e:
        logger.error(f"Error retrieving system message categories: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.get("/api/system-messages/category/{category}", response_model=List[Dict[str, Any]])
async def get_system_messages_by_category(category: str):
    """Retrieve all active system messages for a specific category."""
    try:
        query = "SELECT * FROM c WHERE c.isActive = true AND c.category = @category ORDER BY c.displayOrder"
        parameters = [{"name": "@category", "value": category}]
        items = list(systemmessagescontainer.query_items(
            query=query,
            parameters=parameters,
            enable_cross_partition_query=True
        ))
        return items
    except exceptions.CosmosHttpResponseError as e:
        logger.error(f"Error retrieving system message category: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

# Debugging routes
@app.get("/api/debug/routes")
async def debug_routes():
    try:
        logger.info("="*50)
        logger.info("Debugging routes")
        
        routes_list = []
        for route in app.routes:
            logger.info(f"Found route: {route.path} - {route.methods}")
            routes_list.append({
                "path": str(route.path),
                "methods": list(route.methods) if route.methods else []
            })
        
        logger.info(f"Total routes found: {len(routes_list)}")
        logger.info("="*50)
        
        return {"routes": routes_list}
        
    except Exception as e:
        logger.error(f"Error in debug_routes: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error listing routes: {str(e)}"
        )

# Test database connection
@app.get("/api/test-db")
async def test_db():
    try:
        # Try to query the database
        query = "SELECT VALUE COUNT(1) FROM c"
        result = list(usercontainer.query_items(
            query=query,
            enable_cross_partition_query=True
        ))
        return {"message": "Database connection successful", "count": result[0]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database connection failed: {str(e)}")

# Debug test endpoint
@app.get("/api/debug/test")
async def debug_test():
    logger.info("="*50)
    logger.info("Debug test endpoint hit")
    logger.info("="*50)
    return {"status": "ok", "message": "Debug endpoint working"}

def get_cosmos_client():
    try:
        client = cosmos_client
        yield client
    except Exception as e:
        print(f"Error creating Cosmos DB client: {e}")
        raise

# Health Check Endpoint
@app.get("/healthz", status_code=status.HTTP_200_OK)
async def health_check(cosmos_client: CosmosClient = Depends(get_cosmos_client)):
    """
    Health check endpoint.  Checks Cosmos DB connectivity.
    """
    try:
        # Try to access the database and container to check connectivity
        #cosmos_client = CosmosClient.from_connection_string(os.getenv("COSMOS_CONNECTION_STRING"))
        database = cosmos_client.get_database_client("chat_app")
        container = database.get_container_client("users")

        # Perform a simple read operation (e.g., get one item) to validate connectivity
        try:
            items = list(container.read_all_items(max_item_count=1))  # Adjust as needed. Reading 1 item is a good test.
            if not items:
                print("Health check: No items found in container.  Assuming healthy connection, but container might be empty.")
        except exceptions.CosmosResourceNotFoundError as e:
            print(f"Health check: Container not found: {e}")
            return JSONResponse(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, content={"status": "unhealthy", "error": "Container not found"})

        return {"status": "healthy"}

    except exceptions.CosmosHttpResponseError as e:
        print(f"Health check failed: Cosmos DB connection error: {e}")
        return JSONResponse(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, content={"status": "unhealthy", "error": str(e)})
    except Exception as e:
        print(f"Health check failed: Unexpected error: {e}")
        return JSONResponse(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, content={"status": "unhealthy", "error": str(e)})

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)