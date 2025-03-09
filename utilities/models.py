import os, uuid
from azure.cosmos import CosmosClient, PartitionKey
from datetime import datetime
from dotenv import load_dotenv

load_dotenv(override=True)

# Initialize the Cosmos client
cosmos_client = CosmosClient.from_connection_string(os.getenv("COSMOS_CONNECTION_STRING"))

# Get the database
database = cosmos_client.get_database_client("chat_app")

# Get the container for system messages
container = database.get_container_client("models")

# Current timestamp in ISO format
now = datetime.utcnow().isoformat() + "Z"

models = [
  {
    "id": "claude-3-5-sonnet-20241022",
    "value": "claude-3-5-sonnet-20241022",
    "label": "Claude 3.5 Sonnet",
    "vendor": "Anthropic",
    "system_prompt_supported": "Yes",
    "short_description": "Our previous most intelligent model",
    "context_window": 200000,
    "max_output_tokens": 8192,
    "knowledge_cutoff": "2024-04-01",
    "cost_per_1m_tokens_input": 3.00,
    "cost_per_1m_tokens_output": 15.00,
    "default_model": "claude-3-5-sonnet-20241022",
    "long_description": "High level of intelligence and capability",
    "type": "llm_model",
    "show_in_prod": "Yes"
  },
  {
    "id": "claude-3-7-sonnet-20250219",
    "value": "claude-3-7-sonnet-20250219",
    "label": "Claude 3.7 Sonnet",
    "vendor": "Anthropic",
    "system_prompt_supported": "Yes",
    "short_description": "Our most intelligent model",
    "context_window": 200000,
    "max_output_tokens": 8192,
    "knowledge_cutoff": "2024-11-01",
    "cost_per_1m_tokens_input": 3.00,
    "cost_per_1m_tokens_output": 15.00,
    "default_model": "claude-3-7-sonnet-20250219",
    "long_description": "Highest level of intelligence and capability with toggleable extended thinking",
    "type": "llm_model",
    "show_in_prod": "Yes"
  },
  {
    "id": "deepseek-reasoner",
    "value": "deepseek-reasoner",
    "label": "DeepSeek-R1",
    "vendor": "DeepSeek",
    "system_prompt_supported": "Yes",
    "short_description": "A reasoning-focused model trained through reinforcement learning, achieving top performance in math, reasoning, and coding tasks.",
    "context_window": 64000,
    "max_output_tokens": 8000,
    "knowledge_cutoff": "2023-10-01",
    "cost_per_1m_tokens_input": 0.55,
    "cost_per_1m_tokens_output": 2.19,
    "default_model": "",
    "long_description": "DeepSeek-R1 is an open-source reasoning model that matches OpenAI-o1 in math, reasoning, and code tasks. It presents a novel approach to reasoning tasks by using reinforcement learning(RL) for self evolution, while offering high performance solutions.",
    "type": "llm_model",
    "show_in_prod": "Yes"
  },
  {
    "id": "deepseek-chat",
    "value": "deepseek-chat",
    "label": "DeepSeek-V3",
    "vendor": "DeepSeek",
    "system_prompt_supported": "Yes",
    "short_description": "Utilizes a Mixture of Experts (MoE) architecture for computational efficiency, offering strong performance with reduced resource usage.",
    "context_window": 64000,
    "max_output_tokens": 8000,
    "knowledge_cutoff": "2024-07-01",
    "cost_per_1m_tokens_input": 0.27,
    "cost_per_1m_tokens_output": 1.10,
    "default_model": "",
    "long_description": "DeepSeek V3 is a Mixture of Experts (MoE) language model. Unlike dense models like GPT-4, where all the parameters are used for each and every token, MoE models selectively activate a subset of the model for each token. This version is also significant as it is a 671 billion parameter model but uses 37 billion parameters per token during inference. This means DeepSeek v3 doesn't need the full model to be active at once, it only needs 37 billion parameters active per token. This makes the model more computationally efficient than a fully dense model of the same size.",
    "type": "llm_model",
    "show_in_prod": "Yes"
  },
  {
    "id": "gemini-2.0-flash",
    "value": "gemini-2.0-flash",
    "label": "Gemini 2.0 Flash",
    "vendor": "Google DeepMind",
    "system_prompt_supported": "Yes",
    "short_description": "Our most capable multi-modal model with great performance across all tasks, with a 1 million token context window, and built for the era of Agents.",
    "context_window": 1000000,
    "max_output_tokens": 8192,
    "knowledge_cutoff": "2024-08-01",
    "cost_per_1m_tokens_input": 0.10,
    "cost_per_1m_tokens_output": 0.40,
    "default_model": "",
    "long_description": "Gemini 2.0 Flash offers a comprehensive suite of features, including native tool use, a 1 million token context window, and multimodal input. It currently supports text output, with image and audio output capabilities and the Multimodal Live API planned for general availability in the coming months. Gemini 2.0 Flash-Lite is cost-optimized for large scale text output use cases.",
    "type": "llm_model",
    "show_in_prod": "Yes"
  },
  {
    "id": "gpt-3.5-turbo",
    "value": "gpt-3.5-turbo",
    "label": "GPT 3.5 Turbo",
    "vendor": "OpenAI",
    "system_prompt_supported": "Yes",
    "short_description": "Legacy GPT model for cheaper chat and non-chat tasks",
    "context_window": 16385,
    "max_output_tokens": 4096,
    "knowledge_cutoff": "2021-09-01",
    "cost_per_1m_tokens_input": 0.50,
    "cost_per_1m_tokens_output": 1.50,
    "default_model": "gpt-3.5-turbo-0125",
    "long_description": "GPT-3.5 Turbo models can understand and generate natural language or code and have been optimized for chat using the Chat Completions API but work well for non-chat tasks as well. As of July 2024, use gpt-4o-mini in place of GPT-3.5 Turbo, as it is cheaper, more capable, multimodal, and just as fast. GPT-3.5 Turbo is still available for use in the API.",
    "type": "llm_model",
    "show_in_prod": "Yes"
  },
  {
    "id": "gpt-4",
    "value": "gpt-4",
    "label": "GPT 4",
    "vendor": "OpenAI",
    "system_prompt_supported": "Yes",
    "short_description": "An older high-intelligence GPT model",
    "context_window": 8192,
    "max_output_tokens": 8192,
    "knowledge_cutoff": "2023-12-01",
    "cost_per_1m_tokens_input": 30.00,
    "cost_per_1m_tokens_output": 60.00,
    "default_model": "gpt-4-0613",
    "long_description": "GPT-4 is an older version of a high-intelligence GPT model, usable in Chat Completions.",
    "type": "llm_model",
    "show_in_prod": "Yes"
  },
  {
    "id": "gpt-4-turbo",
    "value": "gpt-4-turbo",
    "label": "GPT 4 Turbo",
    "vendor": "OpenAI",
    "system_prompt_supported": "Yes",
    "short_description": "An older high-intelligence GPT model",
    "context_window": 128000,
    "max_output_tokens": 4096,
    "knowledge_cutoff": "2023-12-01",
    "cost_per_1m_tokens_input": 10.00,
    "cost_per_1m_tokens_output": 30.00,
    "default_model": "gpt-4-turbo-2024-04-09",
    "long_description": "GPT-4 Turbo is the next generation of GPT-4, an older high-intelligence GPT model. It was designed to be a cheaper, better version of GPT-4. Today, we recommend using a newer model like GPT-4o.",
    "type": "llm_model",
    "show_in_prod": "Yes"
  },
  {
    "id": "gpt-4o",
    "value": "gpt-4o",
    "label": "GPT-4o",
    "vendor": "OpenAI",
    "system_prompt_supported": "Yes",
    "short_description": "Fast, intelligent, flexible GPT model",
    "context_window": 128000,
    "max_output_tokens": 16384,
    "knowledge_cutoff": "2023-10-01",
    "cost_per_1m_tokens_input": 2.50,
    "cost_per_1m_tokens_output": 10.00,
    "default_model": "gpt-4o-2024-08-06",
    "long_description": "GPT-4o (\"o\" for \"omni\") is our versatile, high-intelligence flagship model. It accepts both text and image inputs, and produces text outputs (including Structured Outputs). It is the best model for most tasks, and is our most capable model outside of our o-series models.",
    "type": "llm_model",
    "show_in_prod": "Yes"
  },
  {
    "id": "gpt-4o-mini",
    "value": "gpt-4o-mini",
    "label": "GPT 4o mini",
    "vendor": "OpenAI",
    "system_prompt_supported": "Yes",
    "short_description": "Fast, affordable small model for focused tasks",
    "context_window": 128000,
    "max_output_tokens": 16384,
    "knowledge_cutoff": "2023-10-01",
    "cost_per_1m_tokens_input": 0.15,
    "cost_per_1m_tokens_output": 0.60,
    "default_model": "gpt-4o-mini-2024-07-18",
    "long_description": "GPT-4o mini (\"o\" for \"omni\") is a fast, affordable small model for focused tasks. It accepts both text and image inputs, and produces text outputs (including Structured Outputs). It is ideal for fine-tuning, and model outputs from a larger model like GPT-4o can be distilled to GPT-4o-mini to produce similar results at lower cost and latency.",
    "type": "llm_model",
    "show_in_prod": "Yes"
  },
  {
    "id": "gpt-4.5-preview",
    "value": "gpt-4.5-preview",
    "label": "GPT-4.5 Preview",
    "vendor": "OpenAI",
    "system_prompt_supported": "Yes",
    "short_description": "Largest and most capable GPT model",
    "context_window": 128000,
    "max_output_tokens": 16384,
    "knowledge_cutoff": "2023-10-01",
    "cost_per_1m_tokens_input": 75.00,
    "cost_per_1m_tokens_output": 150.00,
    "default_model": "gpt-4.5-preview-2025-02-27",
    "long_description": "This is a research preview of GPT-4.5, our largest and most capable GPT model yet. Its deep world knowledge and better understanding of user intent makes it good at creative tasks and agentic planning. GPT-4.5 excels at tasks that benefit from creative, open-ended thinking and conversation, such as writing, learning, or exploring new ideas.",
    "type": "llm_model",
    "show_in_prod": "Yes"
  },
  {
    "id": "o1-mini",
    "value": "o1-mini",
    "label": "o1-mini",
    "vendor": "OpenAI",
    "system_prompt_supported": "No",
    "short_description": "A faster, more affordable reasoning model than o1",
    "context_window": 128000,
    "max_output_tokens": 65536,
    "knowledge_cutoff": "2023-10-01",
    "cost_per_1m_tokens_input": 1.10,
    "cost_per_1m_tokens_output": 4.40,
    "default_model": "o1-mini-2024-09-12",
    "long_description": "The o1 reasoning model is designed to solve hard problems across domains. o1-mini is a faster and more affordable reasoning model, but we recommend using the newer o3-mini model that features higher intelligence at the same latency and price as o1-mini.",
    "type": "llm_model",
    "show_in_prod": "Yes"
  },
  {
    "id": "o1",
    "value": "o1",
    "label": "o1",
    "vendor": "OpenAI",
    "system_prompt_supported": "Developer",
    "short_description": "High-intelligence reasoning model",
    "context_window": 200000,
    "max_output_tokens": 100000,
    "knowledge_cutoff": "2023-10-01",
    "cost_per_1m_tokens_input": 15.00,
    "cost_per_1m_tokens_output": 60.00,
    "default_model": "O1-2024-12-17",
    "long_description": "The o1 series of models are trained with reinforcement learning to perform complex reasoning. o1 models think before they answer, producing a long internal chain of thought before responding to the user.",
    "type": "llm_model",
    "show_in_prod": "Yes"
  },
  {
    "id": "o3-mini",
    "value": "o3-mini",
    "label": "o3-mini",
    "vendor": "OpenAI",
    "system_prompt_supported": "Developer",
    "short_description": "Fast, flexible, intelligent reasoning model",
    "context_window": 200000,
    "max_output_tokens": 100000,
    "knowledge_cutoff": "2023-10-01",
    "cost_per_1m_tokens_input": 1.10,
    "cost_per_1m_tokens_output": 4.40,
    "default_model": "o3-mini-2025-01-31",
    "long_description": "o3-mini is our newest small reasoning model, providing high intelligence at the same cost and latency targets of o1-mini. o3-mini supports key developer features, like Structured Outputs, function calling, and Batch API.",
    "type": "llm_model",
    "show_in_prod": "Yes"
  }
]

for message in models:
    container.create_item(body=message)

print(f"Added {len(models)} models to the container")
