// Store conversation history
let conversationHistory = [];

// Load conversation from localStorage on page load
document.addEventListener('DOMContentLoaded', () => {
    const savedConversation = localStorage.getItem('chatHistory');
    if (savedConversation) {
        try {
            conversationHistory = JSON.parse(savedConversation);
            // Restore chat messages
            conversationHistory.forEach(msg => {
                addMessage(msg.content, msg.role === 'user' ? 'user-message' : 'bot-message');
            });
        } catch (e) {
            console.error('Error loading chat history:', e);
            conversationHistory = [];
        }
    }
    loadSettings();
});

// Chat form submission
document.getElementById('chat-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const messageInput = document.getElementById('message-input');
    const message = messageInput.value.trim();
    
    if (!message) return;

    // Add user message to chat
    addMessage(message, 'user-message');
    messageInput.value = '';

    // Add user message to conversation history
    conversationHistory.push({
        role: 'user',
        content: message
    });

    try {
        const formData = new FormData();
        formData.append('message', message);
        formData.append('conversation', JSON.stringify(conversationHistory));

        const response = await fetch('/chat', {
            method: 'POST',
            body: formData
        });
    
        const data = await response.json();
        
        if (response.ok) {
            addMessage(data.response, 'bot-message');
            conversationHistory.push({
                role: 'assistant',
                content: data.response
            });
            localStorage.setItem('chatHistory', JSON.stringify(conversationHistory));
        } else {
            console.error('Server error:', data);
            addMessage(`Error: ${data.error || 'Unknown error occurred'}`, 'bot-message error');
        }
    } catch (error) {
        console.error('Network error:', error);
        addMessage('Error: Could not connect to the server. Check console for details.', 'bot-message error');
    }
});

function addMessage(message, className) {
    const messagesContainer = document.getElementById('chat-messages');
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', className);
    messageElement.textContent = message;
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Settings toggle
document.getElementById('toggle-settings').addEventListener('click', () => {
    const settingsPanel = document.getElementById('settings-panel');
    settingsPanel.style.display = settingsPanel.style.display === 'none' ? 'block' : 'none';
});

// Clear chat
document.getElementById('clear-chat').addEventListener('click', () => {
    if (confirm('Are you sure you want to clear the conversation?')) {
        document.getElementById('chat-messages').innerHTML = '';
        conversationHistory = [];
        localStorage.removeItem('chatHistory');
    }
});

// Settings handling
function saveSettings() {
    const settings = {
        model: document.getElementById('model-select').value,
        system_prompt: document.getElementById('system-prompt').value,
        temperature: document.getElementById('temperature').value,
        max_tokens: document.getElementById('max-tokens').value
    };
    localStorage.setItem('chatSettings', JSON.stringify(settings));
}

// Update the loadSettings function to use DEFAULT_SETTINGS as fallback
function loadSettings() {
    const settings = localStorage.getItem('chatSettings');
    if (settings) {
        try {
            const parsedSettings = JSON.parse(settings);
            document.getElementById('model-select').value = parsedSettings.model || DEFAULT_SETTINGS.model;
            document.getElementById('system-prompt').value = parsedSettings.system_prompt || DEFAULT_SETTINGS.system_prompt;
            document.getElementById('temperature').value = parsedSettings.temperature || DEFAULT_SETTINGS.temperature;
            document.getElementById('max-tokens').value = parsedSettings.max_tokens || DEFAULT_SETTINGS.max_tokens;
        } catch (e) {
            console.error('Error loading settings:', e);
            restoreDefaultSettings();
        }
    } else {
        restoreDefaultSettings();
    }
}

// Settings form submission
document.getElementById('settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const settings = {
        model: document.getElementById('model-select').value,
        system_prompt: document.getElementById('system-prompt').value,
        temperature: parseFloat(document.getElementById('temperature').value),
        max_tokens: parseInt(document.getElementById('max-tokens').value)
    };

    try {
        const response = await fetch('/update-settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(settings)
        });

        if (response.ok) {
            saveSettings();
            alert('Settings updated successfully!');
        } else {
            alert('Failed to update settings');
        }
    } catch (error) {
        console.error('Error updating settings:', error);
        alert('Error updating settings');
    }
});

function getModelCost(model) {
    const costs = {
        'gpt-3.5-turbo': {input: 0.0015, output: 0.002},
        'gpt-4': {input: 0.03, output: 0.06},
        'gpt-4-turbo-preview': {input: 0.01, output: 0.03},
        'gpt-3.5-turbo-16k': {input: 0.003, output: 0.004}
    };
    return costs[model] || costs['gpt-3.5-turbo'];
}

// Add this to your model select change event
document.getElementById('model-select').addEventListener('change', function() {
    const model = this.value;
    const costs = getModelCost(model);
    const costInfo = `Input: $${costs.input}/1K tokens, Output: $${costs.output}/1K tokens`;
    document.getElementById('cost-info').textContent = costInfo;
});

// Default settings object
const DEFAULT_SETTINGS = {
    model: 'gpt-3.5-turbo',
    system_prompt: 'You are a helpful assistant.',
    temperature: 0.7,
    max_tokens: 1000
};

// Function to restore default settings
function restoreDefaultSettings() {
    document.getElementById('model-select').value = DEFAULT_SETTINGS.model;
    document.getElementById('system-prompt').value = DEFAULT_SETTINGS.system_prompt;
    document.getElementById('temperature').value = DEFAULT_SETTINGS.temperature;
    document.getElementById('max-tokens').value = DEFAULT_SETTINGS.max_tokens;
}

// Add event listener for restore defaults button
document.getElementById('restore-defaults').addEventListener('click', async () => {
    if (confirm('Are you sure you want to restore default settings?')) {
        restoreDefaultSettings();
        
        // Update server-side settings
        try {
            const response = await fetch('/update-settings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(DEFAULT_SETTINGS)
            });

            if (response.ok) {
                // Clear localStorage settings
                localStorage.removeItem('chatSettings');
                alert('Settings restored to defaults successfully!');
            } else {
                alert('Failed to restore default settings');
            }
        } catch (error) {
            console.error('Error restoring default settings:', error);
            alert('Error restoring default settings');
        }
    }
});