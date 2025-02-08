//main.js

window.onload = function() {
    document.getElementById('message-input').focus();
};

// Store conversation history
let conversationHistory = [];

// Load conversation and settings from localStorage on page load
document.addEventListener('DOMContentLoaded', () => {
    const savedConversation = localStorage.getItem('chatHistory');
    if (savedConversation) {
        try {
            conversationHistory = JSON.parse(savedConversation);
            // Restore chat messages
            conversationHistory.forEach(msg => {
                addMessage(
                    msg.content,
                    msg.role === 'user' ? 'user-message' : 
                    msg.role === 'assistant' ? 'bot-message' :
                    msg.role === 'system' ? 'system-message' : null,
                    msg.timestamp,
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

//Submit message on Enter key (but not with Shift key)
document.getElementById('message-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault(); // Prevent default to avoid newline
        const form = document.getElementById('chat-form');
        form.requestSubmit(); // This is more reliable than dispatchEvent
        document.getElementById('message-input').focus();
    }
});

document.getElementById('save-conversation').addEventListener('click', async () => {
    try {
        const response = await fetch('/save-conversation', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(conversationHistory) // Send conversation history for saving
        });

        if (response.ok) {
            alert('Conversation saved successfully!');
        } else {
            alert('Failed to save conversation');
        }
    } catch (error) {
        console.error('Error saving conversation:', error);
        alert('Error saving conversation');
    }
});

// Chat form submission
document.getElementById('chat-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const messageInput = document.getElementById('message-input');
    const message = messageInput.value.trim();

    if (!message) return;

    // Add system message to chat and conversation history if it is empty
    // Todo: Do not send system message if the model does not support it
    // const selectedModel = document.getElementById('model-select').value;
    if (conversationHistory.length === 0) {
        addMessage(document.getElementById('system-prompt').value, 'system-message', formatDate(new Date()));
        conversationHistory.push({
            role: 'system',
            content: document.getElementById('system-prompt').value,
            timestamp: formatDate(new Date())
        });
    }
    
    // Add user message to chat and onversation history
    addMessage(escapeHTML(message), 'user-message', formatDate(new Date()));
    messageInput.value = '';
    conversationHistory.push({
        role: 'user',
        content: escapeHTML(message),
        timestamp: formatDate(new Date())
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
            addMessage(data.response, 'bot-message', formatDate(new Date()), selectedModel);
            //addMessage(data.response, 'bot-message');
            // Add bot message to conversation history
            conversationHistory.push({
                role: 'assistant',
                content: data.response,
                timestamp: formatDate(new Date()),
                model: selectedModel
            });

            //Reset char count
            document.getElementById('char-count').textContent = `0 characters`;

            // Save updated conversation to localStorage
            localStorage.setItem('chatHistory', JSON.stringify(conversationHistory));
            document.getElementById('message-input').focus();
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
// document.getElementById('message-input').addEventListener('input', function () {
//     this.style.height = 'auto';
//     this.style.height = (this.scrollHeight) + 'px';
// });

document.getElementById('message-input').addEventListener('input', function () {
    const charCount = this.value.length;
    document.getElementById('char-count').textContent = `${charCount} characters`;
});

function addMessage(message, className, timestamp, model = null) {
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

    // Add model info for bot messages
    if (className === 'bot-message' && model) {
        const modelInfo = document.createElement('div');
        modelInfo.classList.add('model-info');
        modelInfo.textContent = `Model: ${model}`;
    }

    // Add timestamp
    const msgtimestamp = document.createElement('div');
    msgtimestamp.classList.add('message-timestamp');
    if (className != 'system-message'){
        msgtimestamp.textContent = timestamp
    }

    // Add header line
    if (className === 'bot-message') {
        const lineDiv = document.createElement('div');
        lineDiv.classList.add('bot-message-line');
        lineDiv.textContent = model + ':';
        messageElement.appendChild(lineDiv);
    } else if (className === 'user-message') {
        const lineDiv = document.createElement('div');
        lineDiv.classList.add('user-message-line');
        lineDiv.textContent = "User:";
        messageElement.appendChild(lineDiv);
    } else {
        const lineDiv = document.createElement('div');
        lineDiv.classList.add('system-message-line');
        lineDiv.textContent = "System message:";
        messageElement.appendChild(lineDiv);
    }

    // Add action buttons
    const actionsDiv = document.createElement('div');
    actionsDiv.classList.add('message-actions');

    // Copy button
    const copyButton = document.createElement('button');
    if (className === 'user-message') {
        copyButton.classList.add('action-button-user');
    } else {
        copyButton.classList.add('action-button');
    }
    copyButton.innerHTML = '📋 Copy';
    copyButton.onclick = () => {
        // get the div that contains the button
        const buttonContainer = copyButton.parentElement;
        // get the second previous sibling (should be the div you want to copy from)
        const textContainer = buttonContainer.previousElementSibling.previousElementSibling;
        // get the text from the div you want to copy from
        const messagetocopy = textContainer.innerText;
        navigator.clipboard.writeText(messagetocopy)
            .then(() => {
                copyButton.innerHTML = '✓ Copied!';
                setTimeout(() => copyButton.innerHTML = '📋 Copy', 2000);
            });
    };

    // Feedback buttons (for bot messages only)
    // if (className === 'bot-message') {
    //     const likeButton = document.createElement('button');
    //     likeButton.classList.add('action-button');
    //     likeButton.innerHTML = '👍';
    //     likeButton.onclick = () => handleFeedback(message, 'positive');

    //     const dislikeButton = document.createElement('button');
    //     dislikeButton.classList.add('action-button');
    //     dislikeButton.innerHTML = '👎';
    //     dislikeButton.onclick = () => handleFeedback(message, 'negative');
    //     actionsDiv.appendChild(likeButton);
    //     actionsDiv.appendChild(dislikeButton);
    // }
    actionsDiv.appendChild(copyButton);
    messageElement.appendChild(contentDiv);
    messageElement.appendChild(msgtimestamp);
    messageElement.appendChild(actionsDiv);
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Add typing indicator functions
function showTypingIndicator() {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) {
        indicator.style.display = 'flex';//flex
        const messagesContainer = document.getElementById('chat-messages');
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}

function hideTypingIndicator() {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) {
        indicator.style.display = 'block';//none
    }
}

// Clear chat
document.getElementById('clear-chat').addEventListener('click', () => {
    if (confirm('Are you sure you want to clear the conversation?')) {
        document.getElementById('chat-messages').innerHTML = '';
        conversationHistory = [];
        localStorage.removeItem('chatHistory');
        document.getElementById('message-input').focus();
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

// Register button click event
document.getElementById('register-button').addEventListener('click', function() {
    document.getElementById('registration-form').style.display = 'block';
    document.getElementById('email').focus();
});

// Registration form submit event
document.getElementById('register-submit').addEventListener('click', async function() {
    const email = document.getElementById('email').value.trim();

    // Perform validation on the email address (you can add more validation as needed)

    if (validateEmail(email)) {
        try {
            const response = await fetch('/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email: email })
            });

            if (response.ok) {
                alert('Confirmation email sent. Please check your inbox.');
            } else {
                alert('Failed to send confirmation email. Please try again.');
            }
        } catch (error) {
            console.error('Error sending registration request:', error);
            alert('Error sending registration request.');
        }
    } else {
        alert('Please enter a valid email address.');
    }
});

// Email validation function
function validateEmail(email) {
    const re = /\S+@\S+\.\S+/;
    return re.test(email);
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
        document.getElementById('message-input').focus();
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
            document.getElementById('message-input').focus();
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
    document.getElementById('message-input').focus();
}
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        modal.style.display = "none";
        document.getElementById('message-input').focus();
    }
})

// Get the Registration form
var regform = document.getElementById("registration-form");
// Get the <span> element that closes the modal
var spanregform = document.getElementsByClassName("close-regform")[0];
// When the user clicks on <span> (x), close the modal
spanregform.onclick = function () {
    regform.style.display = "none";
    document.getElementById('message-input').focus();
}
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        regform.style.display = "none";
        document.getElementById('message-input').focus();
    }
})

function escapeHTML(html) {
    const text = document.createTextNode(html);
    const div = document.createElement('div');
    div.appendChild(text);
    return div.innerHTML;
}

function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}
