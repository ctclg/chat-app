// main.js
import { Chat } from './components/chat.js';
import { Settings } from './components/settings.js';
import { ConversationManager } from './components/conversationManager.js';
import { AuthApi } from './api/authApi.js';
import { showLoadingOverlay, removeLoadingOverlay } from './utils/helpers.js';

class App {
    constructor() {
        this.init();
    }

    async init() {
        try {
            // Show loading overlay after 1 second delay
            let loadingOverlay = null;
            const loadingTimeout = setTimeout(() => {
                const chatMessages = document.getElementById('chat-messages');
                if (chatMessages) {
                    loadingOverlay = showLoadingOverlay(chatMessages, 'Loading...');
                }
            }, 1000);

            // Initialize components
            this.settings = new Settings();
            this.chat = new Chat(this); // Pass 'this' (the App instance) to Chat
            this.conversationManager = new ConversationManager(this.chat, this);

            // Update UI based on auth state
            this.updateUIForAuthState();

            // Initialize scroll buttons
            this.initializeScrollButtons();

            // Set up event listeners
            this.setupEventListeners();

            // Set selected model from settings
            this.updateSelectedModel();

            // Clear loading overlay
            clearTimeout(loadingTimeout);
            if (loadingOverlay) {
                removeLoadingOverlay(loadingOverlay);
            }

        } catch (error) {
            console.error('Initialization error:', error);
        }
    }

    updateUIForAuthState() {
        const isLoggedIn = !!localStorage.getItem('token'); // Simplified check

        const elements = {
            'load-conversations': isLoggedIn,
            'save-conversation': isLoggedIn,
            'login': !isLoggedIn,
            'logout': isLoggedIn
        };

        Object.entries(elements).forEach(([id, show]) => {
            const element = document.getElementById(id);
            if (element) {
                element.style.display = show ? 'block' : 'none';
            }
        });
    }

    setupEventListeners() {
        // Login/Logout handlers
        document.getElementById('login').addEventListener('click', () => {
            window.location.href = '/static/html/login.html';
        });

        document.getElementById('logout').addEventListener('click', () => {
            AuthApi.logout();
        });

        // Character count for message input
        document.getElementById('message-input').addEventListener('input', 
            (e) => this.updateCharCount(e));
    }

    updateCharCount(e) {
        const charCount = e.target.value.length;
        document.getElementById('char-count').textContent = 
            `${charCount} characters`;
    }

    updateSelectedModel() {
        const settings = JSON.parse(localStorage.getItem('chatSettings'));
        if (settings) {
            document.getElementById('selected-model').textContent = "Selected model: " + settings.model;
        }
    }

    initializeScrollButtons() {
        const chatMessages = document.getElementById('chat-messages');
        
        // Create scroll controls container
        const scrollControls = document.createElement('div');
        scrollControls.className = 'scroll-controls';
        
        // Create scroll to top button
        const scrollToTopBtn = document.createElement('div');
        scrollToTopBtn.className = 'scroll-icon top-icon';
        scrollToTopBtn.id = 'scrollToTop';
        scrollToTopBtn.innerHTML = '<i class="fas fa-angle-up"></i>';
        
        // Create scroll to bottom button
        const scrollToBottomBtn = document.createElement('div');
        scrollToBottomBtn.className = 'scroll-icon bottom-icon';
        scrollToBottomBtn.id = 'scrollToBottom';
        scrollToBottomBtn.innerHTML = '<i class="fas fa-angle-down"></i>';
        
        // Add buttons to scroll controls
        scrollControls.appendChild(scrollToTopBtn);
        scrollControls.appendChild(scrollToBottomBtn);
        
        // Add scroll controls before chat messages
        chatMessages.parentElement.insertBefore(scrollControls, chatMessages);
        
        // Store references to elements and function
        this.chatMessages = chatMessages;
        this.scrollToTopBtn = scrollToTopBtn;
        this.scrollToBottomBtn = scrollToBottomBtn;
        
        // Initialize scroll functionality
        this.initializeScrollFunctionality();
    }

    initializeScrollFunctionality() {
        // Scroll to Top
        this.scrollToTopBtn.addEventListener('click', () => {
            this.chatMessages.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });

        // Scroll to Bottom
        this.scrollToBottomBtn.addEventListener('click', () => {
            this.chatMessages.scrollTo({
                top: this.chatMessages.scrollHeight,
                behavior: 'smooth'
            });
        });

        // Toggle button visibility based on scroll position
        this.toggleScrollButtons = () => {
            // Check if scrolling is possible
            const hasScroll = this.chatMessages.scrollHeight > this.chatMessages.clientHeight;

            if (!hasScroll) {
                // Hide both buttons if no scrolling is needed
                this.scrollToTopBtn.style.visibility = 'hidden';
                this.scrollToBottomBtn.style.visibility = 'hidden';
                return;
            }

            // If scrolling is possible, check positions
            const isAtTop = this.chatMessages.scrollTop === 0;
            this.scrollToTopBtn.style.visibility = isAtTop ? 'hidden' : 'visible';

            const isAtBottom = 
                this.chatMessages.scrollHeight - this.chatMessages.scrollTop - this.chatMessages.clientHeight < 1;
            this.scrollToBottomBtn.style.visibility = isAtBottom ? 'hidden' : 'visible';
        };

        // Initial toggle
        this.toggleScrollButtons();

        // Add scroll event listener
        this.chatMessages.addEventListener('scroll', this.toggleScrollButtons);

        // Check when content changes or window resizes
        this.resizeObserver = new ResizeObserver(this.toggleScrollButtons);
        this.resizeObserver.observe(this.chatMessages);
    }

    // Method to call after loading a conversation
    updateScrollButtons() {
        if (this.toggleScrollButtons) {
            this.toggleScrollButtons();
        }
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new App();
});