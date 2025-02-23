// utils/constants.js
export const API_ENDPOINTS = {
    CHAT: '/chat',
    SETTINGS: '/settings',
    CONVERSATIONS: '/api/conversations',
    MODELS: '/api/models',
    FOLDERS: '/api/folders'
};

export const DEFAULT_SETTINGS = {
    model: 'Dummy',
    system_prompt_supported: "X",
    system_prompt: 'Bla.',
    temperature: 0,
    max_tokens: 1
};

export const LOCAL_STORAGE_KEYS = {
    TOKEN: 'token',
    CHAT_HISTORY: 'chatHistory',
    SETTINGS: 'chatSettings',
    CURRENT_CONVERSATION: 'currentConversation'
};