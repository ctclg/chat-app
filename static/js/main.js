document.getElementById('chat-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const messageInput = document.getElementById('message-input');
    const message = messageInput.value.trim();
    
    if (!message) return;

    // Add user message to chat
    addMessage(message, 'user-message');
    messageInput.value = '';

    try {
        const response = await fetch('/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `message=${encodeURIComponent(message)}`
        });

        const data = await response.json();
        
        if (response.ok) {
            addMessage(data.response, 'bot-message');
        } else {
            addMessage('Error: ' + data.error, 'bot-message error');
        }
    } catch (error) {
        addMessage('Error: Could not connect to the server', 'bot-message error');
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