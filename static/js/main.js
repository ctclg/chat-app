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
                //addMessage(msg.content, msg.role === 'user' ? 'user-message' : 'bot-message');
                addMessage(
                    msg.content,
                    msg.role === 'user' ? 'user-message' : 'bot-message',
                    msg.role === 'assistant' ? msg.model : null
                );
            });
        } catch (e) {
            console.error('Error loading chat history:', e);
            conversationHistory = [];
        }
    }
    loadSettings();
});

document.addEventListener('DOMContentLoaded', function () {
    const textarea = document.getElementById('message-input');

    // Initial resize
    autoResize(textarea);

    // Resize on input
    textarea.addEventListener('input', function () {
        autoResize(this);
    });

    // Reset height after form submission
    document.getElementById('chat-form').addEventListener('submit', function () {
        setTimeout(() => {
            textarea.style.height = '50px'; // Reset to minimum height
        }, 0);
    });
});

document.getElementById('message-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault(); // Prevent default to avoid newline
        const form = document.getElementById('chat-form');
        form.requestSubmit(); // This is more reliable than dispatchEvent
    }
});

// Chat form submission
document.getElementById('chat-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const messageInput = document.getElementById('message-input');
    const message = messageInput.value.trim();

    if (!message) return;

    // Add user message to chat
    addMessage(escapeHTML(message), 'user-message');
    messageInput.value = '';

    // Add user message to conversation history
    conversationHistory.push({
        role: 'user',
        content: escapeHTML(message)
    });

    // Save to localStorage immediately after adding user message
    localStorage.setItem('chatHistory', JSON.stringify(conversationHistory));

    showTypingIndicator();

    try {
        const formData = new FormData();
        formData.append('message', message);
        formData.append('conversation', JSON.stringify(conversationHistory));

        const response = await fetch('/chat', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        hideTypingIndicator();

        if (response.ok) {

            // Add bot message to chat
            const selectedModel = document.getElementById('model-select').value;
            addMessage(data.response, 'bot-message', selectedModel);
            //addMessage(data.response, 'bot-message');
            // Add bot message to conversation history
            conversationHistory.push({
                role: 'assistant',
                content: data.response,
                model: selectedModel
            });

            //Reset char count
            document.getElementById('char-count').textContent = `0 characters`;

            // Save updated conversation to localStorage
            localStorage.setItem('chatHistory', JSON.stringify(conversationHistory));
        } else {
            console.error('Server error:', data);
            addMessage(`Error: ${data.error || 'Unknown error occurred'}`, 'bot-message error');
        }
    } catch (error) {
        hideTypingIndicator();
        console.error('Network error:', error);
        addMessage('Error: Could not connect to the server.', 'bot-message error');
    }
});

// Add auto-resize functionality to the textarea
document.getElementById('message-input').addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
});

document.getElementById('message-input').addEventListener('input', function () {
    const charCount = this.value.length;
    document.getElementById('char-count').textContent = `${charCount} characters`;
});

function addMessage(message, className, model = null) {
    const messagesContainer = document.getElementById('chat-messages');
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', className);

    // Create message content with Markdown support
    const contentDiv = document.createElement('div');
    contentDiv.classList.add('message-content');
    if (typeof marked !== 'undefined') {
        contentDiv.innerHTML = marked.parse(message);
    } else {
        contentDiv.textContent = message;
    }
    //contentDiv.innerHTML = marked.parse(message);

    // Add model info for bot messages
    if (className === 'bot-message' && model) {
        const modelInfo = document.createElement('div');
        modelInfo.classList.add('model-info');
        modelInfo.textContent = `Model: ${model}`;
        //contentDiv.appendChild(modelInfo); // Show it has header instead, see below
    }

    // Add timestamp
    const timestamp = document.createElement('div');
    timestamp.classList.add('message-timestamp');
    timestamp.textContent = new Date().toLocaleTimeString();

    // Add line
    if (className === 'bot-message') {
        const lineDiv = document.createElement('div');
        lineDiv.classList.add('bot-message-line');
        lineDiv.textContent = model + ':';
        messageElement.appendChild(lineDiv);
    } else {
        const lineDiv = document.createElement('div');
        lineDiv.classList.add('user-message-line');
        lineDiv.textContent = "User:";
        messageElement.appendChild(lineDiv);
    }

    // Add action buttons
    const actionsDiv = document.createElement('div');
    actionsDiv.classList.add('message-actions');

    // Copy button
    const copyButton = document.createElement('button');
    copyButton.classList.add('action-button');
    copyButton.innerHTML = '📋 Copy';
    copyButton.onclick = () => {
        navigator.clipboard.writeText(message)
            .then(() => {
                copyButton.innerHTML = '✓ Copied!';
                setTimeout(() => copyButton.innerHTML = '📋 Copy', 2000);
            });
    };

    // Feedback buttons (for bot messages only)
    if (className === 'bot-message') {
        const likeButton = document.createElement('button');
        likeButton.classList.add('action-button');
        likeButton.innerHTML = '👍';
        likeButton.onclick = () => handleFeedback(message, 'positive');

        const dislikeButton = document.createElement('button');
        dislikeButton.classList.add('action-button');
        dislikeButton.innerHTML = '👎';
        dislikeButton.onclick = () => handleFeedback(message, 'negative');
        actionsDiv.appendChild(likeButton);
        actionsDiv.appendChild(dislikeButton);
    }
    actionsDiv.appendChild(copyButton);
    messageElement.appendChild(contentDiv);
    messageElement.appendChild(timestamp);
    messageElement.appendChild(actionsDiv);
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Add typing indicator functions
function showTypingIndicator() {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) {
        indicator.style.display = 'flex';
        const messagesContainer = document.getElementById('chat-messages');
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}

function hideTypingIndicator() {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) {
        indicator.style.display = 'none';
    }
}

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
            //alert('Settings updated successfully!');
        } else {
            alert('Failed to update settings');
        }
        modal.style.display = "none";
    } catch (error) {
        console.error('Error updating settings:', error);
        alert('Error updating settings');
    }
});

function getModelCost(model) {
    const costs = {
        'gpt-3.5-turbo': { input: 0.0015, output: 0.002 },
        'gpt-4': { input: 0.03, output: 0.06 },
        'gpt-4-turbo-preview': { input: 0.01, output: 0.03 },
        'gpt-3.5-turbo-16k': { input: 0.003, output: 0.004 }
    };
    return costs[model] || costs['gpt-3.5-turbo'];
}

// Add this to your model select change event
document.getElementById('model-select').addEventListener('change', function () {
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

// Add this function to handle textarea auto-resize
function autoResize(textarea) {
    // Reset height to allow shrinking
    textarea.style.height = 'auto';

    // Set new height based on scroll height
    const newHeight = Math.min(textarea.scrollHeight, 200); // 200px max height
    textarea.style.height = newHeight + 'px';
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
                modal.style.display = "none";
                //alert('Settings restored to defaults successfully!');
            } else {
                alert('Failed to restore default settings');
            }
        } catch (error) {
            console.error('Error restoring default settings:', error);
            alert('Error restoring default settings');
        }
    }
});

// Feedback handling function
async function handleFeedback(message, type) {
    try {
        await fetch('/feedback', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: message,
                feedback: type
            })
        });
        // Show feedback confirmation
        const feedbackMsg = type === 'positive' ? 'Thanks for the positive feedback!' : 'Thanks for the feedback. We\'ll work on improving.';
        const notification = document.createElement('div');
        notification.className = 'feedback-notification';
        notification.textContent = feedbackMsg;
        document.body.appendChild(notification);

        // Remove notification after 3 seconds
        setTimeout(() => {
            notification.remove();
        }, 3000);
    } catch (error) {
        console.error('Error sending feedback:', error);
        alert('Failed to send feedback');
    }
}

// Add these CSS styles for the feedback notification
const style = document.createElement('style');
style.textContent = `
    .feedback-notification {
        position: fixed;
        bottom: 20px;
        right: 20px;
        background-color: #28a745;
        color: white;
        padding: 10px 20px;
        border-radius: 5px;
        animation: slideIn 0.3s ease-out, fadeOut 0.3s ease-in 2.7s;
        z-index: 1000;
    }

    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }

    @keyframes fadeOut {
        from { opacity: 1; }
        to { opacity: 0; }
    }
`;
document.head.appendChild(style);

// Get the modal
var modal = document.getElementById("settings-modal");

// Get the button that opens the modal
var btn = document.getElementById("toggle-settings");

// Get the <span> element that closes the modal
var span = document.getElementsByClassName("close")[0];

// When the user clicks the button, open the modal 
btn.onclick = function () {
    modal.style.display = "block";
    loadSettings(); // Update form fields with saved settings
}

// When the user clicks on <span> (x), close the modal
span.onclick = function () {
    modal.style.display = "none";
}

// When the user clicks anywhere outside of the modal, close it
window.onclick = function (event) {
    if (event.target == modal) {
        modal.style.display = "none";
    }
}

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        modal.style.display = "none";
    }
})

function escapeHTML(html) {
    const text = document.createTextNode(html);
    const div = document.createElement('div');
    div.appendChild(text);
    return div.innerHTML;
}