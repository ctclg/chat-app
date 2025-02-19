#main.py

import json, logging, openai, os, secrets, uuid, anthropic, asyncio
from azure.cosmos import CosmosClient, PartitionKey
from datetime import datetime, timedelta
from dotenv import load_dotenv
from fastapi import FastAPI, Request, Form, HTTPException, Depends, status, APIRouter, BackgroundTasks, APIRouter, Query
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, RedirectResponse, FileResponse, HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi_mail import FastMail, MessageSchema, ConnectionConfig
from jose import JWTError, jwt
from logging.handlers import RotatingFileHandler
from openai import OpenAI
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr
from typing import List, Optional, Dict

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

openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
anthropic_client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"),)
deepseek_client = OpenAI(api_key=os.getenv("DEEPSEEK_API_KEY"), base_url="https://api.deepseek.com")

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Cosmos DB setup
cosmos_client = CosmosClient.from_connection_string(os.getenv("COSMOS_CONNECTION_STRING"))
database = cosmos_client.get_database_client("chat_app")
usercontainer = database.get_container_client("users")
conversationcontainer = database.get_container_client("conversations")
tokencontainer = database.get_container_client("tokens")


DEFAULT_SETTINGS = {
    "system_prompt": os.getenv("SYSTEM_PROMPT"),
    "model": os.getenv("MODEL"),
    "temperature": float(os.getenv("TEMPERATURE")),
    "max_tokens": int(os.getenv("MAX_TOKENS"))
}

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
        "model": os.getenv("MODEL", "claude-3-5-sonnet-20241022"),
        "system_prompt_supported": os.getenv("SYSTEM_PROMPT_SUPPORTED", "Yes"),
        "system_prompt": os.getenv("SYSTEM_PROMPT", "You are a helpful assistant."),
        "temperature": float(os.getenv("TEMPERATURE", 0.7)),
        "max_tokens": int(os.getenv("MAX_TOKENS", 1000))
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
        messages.extend(conversation_list)
        messages.append({"role": "user", "content": message})
        logger.info(f"conversation_list: {conversation_list}")
        logger.info(f"messages: {messages}")

        # This is optional, but I leave it here
        # Loop through the data and modify the 'content' field
        for message in messages:
            # Convert 'content' to a list containing a dictionary with 'type' and 'text'
            message['content'] = [{"type": "text", "text": message['content']}]

        for message in messages:
            if 'timestamp' in message:
                del message['timestamp']
            if 'model' in message:
                del message['model']

        selectedmodel = DEFAULT_SETTINGS["model"]

        # o1-mini only support the value 1 in the temperature parameter, and max_token is max_completion_tokens
        if "o1-mini" in selectedmodel.lower():
            messages.pop(0) #Remove the first item in the list, as o1 does not accept the system role
            messages.pop() #Remove the last item in the list, because it is duplicate for some reason
            logger.info(f"o1-mini messages: {messages}")
            response = openai_client.chat.completions.create(
                model=DEFAULT_SETTINGS["model"], 
                messages=messages,
                temperature=1,
                max_completion_tokens=DEFAULT_SETTINGS["max_tokens"]
            )
            logger.info(f"o1-mini response: {response}")
            return JSONResponse(content={
                "response": response.choices[0].message.content
                })

        # o1-preview does not support the temperature parameter, and max_token is max_completion_tokens
        if "o1-preview" in selectedmodel.lower():
            messages.pop(0) #Remove the first item in the list, as o1 does not accept the system role
            messages.pop() #Remove the last item in the list, because it is duplicate for some reason
            logger.info(f"o1-preview messages: {messages}")
            response = openai_client.chat.completions.create(
                model=DEFAULT_SETTINGS["model"], 
                messages=messages,
                max_completion_tokens=DEFAULT_SETTINGS["max_tokens"]
            )
            logger.info(f"o1-preview response: {response}")
            return JSONResponse(content={
                "response": response.choices[0].message.content
                })

        if "gpt" in selectedmodel.lower():
            messages.pop() #Remove the last item in the list, because it is duplicate for some reason
            logger.info(f"gpt messages: {messages}")
            response = openai_client.chat.completions.create(
                model=DEFAULT_SETTINGS["model"], 
                messages=messages,
                temperature=DEFAULT_SETTINGS["temperature"],
                max_tokens=DEFAULT_SETTINGS["max_tokens"]
            )
            logger.info(f"gpt response: {response}")
            return JSONResponse(content={
                "response": response.choices[0].message.content
                })

        if "deepseek" in selectedmodel.lower():
            messages.pop() #Remove the last item in the list, because it is duplicate for some reason
            logger.info(f"deepseek messages: {messages}")
            response = deepseek_client.chat.completions.create(
                model=DEFAULT_SETTINGS["model"], 
                messages=messages,
                temperature=DEFAULT_SETTINGS["temperature"],
                max_tokens=DEFAULT_SETTINGS["max_tokens"]
            )
            logger.info(f"deepseek response: {response}")
            return JSONResponse(content={
                "response": response.choices[0].message.content
                })

        if "claude" in selectedmodel.lower():
            messages.pop(0) #Remove the first item in the list, as claude does not accept the system role
            messages.pop() #Remove the last item in the list, because it is duplicate for some reason
            logger.info(f"claude messages: {messages}")
            response = anthropic_client.messages.create(
                model=DEFAULT_SETTINGS["model"], 
                messages=messages, 
                system=DEFAULT_SETTINGS["system_prompt"],
                temperature=DEFAULT_SETTINGS["temperature"],
                max_tokens=DEFAULT_SETTINGS["max_tokens"]
            )
            logger.info(f"claud response: {response}")
            return JSONResponse(content={
                "response": response.content[0].text
                })

    except Exception as e:
        logger.error(f"Error calling LLM API: {str(e)}")
        logger.exception("Full exception details:")
        return JSONResponse(content={"error": str(e)}, status_code=500)

# Update chat settings
@app.post("/update-settings")
async def update_settings(settings: ChatSettings):
    global DEFAULT_SETTINGS
    DEFAULT_SETTINGS = settings.dict()
    return JSONResponse(content={"message": "Settings updated successfully"})

# Get available models
@app.get("/api/models")
async def get_models():
    models_json = os.getenv("AVAILABLE_MODELS", "[]")
    models = json.loads(models_json)
    logger.info(f"Available models: {models}")
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
         c.id, c.partitionKey, c.user_id, c.name, c.folder, c.created_at, c.updated_at, c.type,
         c.id as messages, c._rid, c._self, c._etag, c._attachments, c._ts
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
'''
@app.put("/api/conversations/{conversation_id}")
async def rename_conversation(
    conversation_id: str,
    request: dict,
    current_user = Depends(get_current_user)
):
    try:
        # Check if conversation exists
        partition_key = f'CHAT#{current_user["id"]}'
        
        # Update conversation
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
'''

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

# # Generate verification token
# def generate_verification_token():
#     return secrets.token_urlsafe(16)

# # Set up logging
# logging.basicConfig(
#     level=logging.INFO,
#     format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
# )
# logger = logging.getLogger(__name__)

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)