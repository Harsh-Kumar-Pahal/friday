 // System state
 let chatHistory = [];
 let isListening = false;
 let isSpeaking = false;
 let wasInterrupted = false;
 let recognition = null;
 let lastCapturedImage = null;
 let cameraOn = false;
 const activationPhrase = '';
 let synth = window.speechSynthesis;
 let currentVoice = null;
 let recognitionRetryCount = 0;
 const maxRetries = 5;

 // DOM elements
 const chatToggle = document.getElementById('chat-toggle');
 const cameraButton = document.getElementById('camera-button');
 const webcam = document.getElementById('webcam');
 const webcamContainer = document.getElementById('webcam-container');
 const sideChat = document.getElementById('side-chat');

 // Firebase initialization (using CDN with modular approach)
 document.addEventListener('DOMContentLoaded', function() {
     // Load Firebase scripts dynamically
     const firebaseAppScript = document.createElement('script');
     firebaseAppScript.src = 'https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js';
     document.head.appendChild(firebaseAppScript);
     
     firebaseAppScript.onload = function() {
         const firebaseDatabaseScript = document.createElement('script');
         firebaseDatabaseScript.src = 'https://www.gstatic.com/firebasejs/9.22.0/firebase-database-compat.js';
         document.head.appendChild(firebaseDatabaseScript);
         
         firebaseDatabaseScript.onload = function() {
             initFirebase();
         };
     };
 });

 function initFirebase() {
     // Firebase configuration (REPLACE WITH YOUR FIREBASE PROJECT CONFIG)
     const firebaseConfig = {
         apiKey: "AIzaSyCicMEb-Q3dHxmjX319nWEqjwCzjg--ZrE",
authDomain: "airstore-c4fce.firebaseapp.com",
databaseURL: "https://airstore-c4fce-default-rtdb.firebaseio.com",
projectId: "airstore-c4fce",
storageBucket: "airstore-c4fce.appspot.com",
messagingSenderId: "733213242091",
appId: "1:733213242091:web:9116b295e1776d3d8204ae",
measurementId: "G-BR4NXGHMP9"
     };

     // Initialize Firebase
     firebase.initializeApp(firebaseConfig);
     const database = firebase.database();
     const chatRef = database.ref('chatHistory');
     
     // Initialize chat history from Firebase
     initChatHistory(chatRef);
 }

 // Initialize chat history from Firebase
 function initChatHistory(chatRef) {
     if (!chatRef) return;
     
     chatRef.on('value', (snapshot) => {
         const data = snapshot.val();
         chatHistory = data ? Object.values(data) : [];
         updateSideChat();
     }, (error) => {
         console.error('Error loading chat history:', error);
         chatHistory = [];
         updateSideChat();
     });
 }

 // Save chat history to Firebase
 function saveChatHistory() {
     if (typeof firebase !== 'undefined' && firebase.database) {
         const database = firebase.database();
         const chatRef = database.ref('chatHistory');
         
         chatRef.set(chatHistory).catch((error) => {
             console.error('Error saving chat history:', error);
         });
     } else {
         console.warn('Firebase not initialized, chat history not saved');
     }
 }

 // API configuration
 const API_KEY = 'AIzaSyDzz7WKn72if6YM8dp-MEp85NZL7m5_7RE';
 const visionEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent?key=${API_KEY}`;
 const textEndpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent';

 // Speech recognition setup
 function initVoiceRecognition() {
     const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
     if (!SpeechRecognition) {
         console.error('Speech recognition not supported');
         return;
     }

     function createRecognition() {
         recognition = new SpeechRecognition();
         recognition.continuous = true;
         recognition.interimResults = true;
         recognition.maxAlternatives = 1;

         recognition.onstart = () => {
             isListening = true;
             recognitionRetryCount = 0;
         };

         recognition.onend = () => {
             isListening = false;
             if (!isSpeaking && !wasInterrupted) {
                 restartRecognition();
             }
         };

         recognition.onresult = (event) => {
             const last = event.results.length - 1;
             const transcript = event.results[last][0].transcript.trim();

             if (!isListening && transcript.toLowerCase().includes(activationPhrase.toLowerCase())) {
                 activateListening();
                 return;
             }

             if (event.results[last].isFinal && isListening) {
                 stopSpeaking();
                 processCommand(transcript);
             }
         };

         recognition.onerror = (event) => {
             console.error('Recognition error:', event.error);
             if (!isSpeaking && event.error !== 'no-speech' && !wasInterrupted) {
                 restartRecognition();
             }
         };
     }

     function restartRecognition() {
         if (recognitionRetryCount >= maxRetries) {
             console.warn('Max retries reached, resetting recognition');
             createRecognition();
             recognitionRetryCount = 0;
         }

         setTimeout(() => {
             if (!isListening && !isSpeaking && !wasInterrupted) {
                 try {
                     recognition.start();
                 } catch (e) {
                     console.warn('Failed to restart recognition:', e);
                     recognitionRetryCount++;
                     restartRecognition();
                 }
             }
         }, Math.min(1000 * Math.pow(2, recognitionRetryCount), 5000));
     }

     navigator.permissions.query({ name: 'microphone' }).then((result) => {
         if (result.state === 'denied') {
             console.error('Microphone permission denied');
             return;
         }
         createRecognition();
         try {
             recognition.start();
         } catch (e) {
             console.error('Error starting recognition:', e);
             restartRecognition();
         }
     }).catch((e) => {
         console.error('Error checking microphone permission:', e);
         createRecognition();
         try {
             recognition.start();
         } catch (e) {
             console.error('Error starting recognition:', e);
             restartRecognition();
         }
     });
 }

 function activateListening() {
     isListening = true;
     wasInterrupted = false;
     speak('I\'m listening').catch(() => {});
 }

 function deactivateListening() {
     isListening = false;
     if (recognition) {
         try {
             recognition.stop();
         } catch (e) {
             console.warn('Error stopping recognition:', e);
         }
     }
 }

 // Speech synthesis
 async function loadVoices() {
     try {
         const voices = await new Promise((resolve) => {
             let voices = synth.getVoices();
             if (voices.length > 0) {
                 resolve(voices);
             } else {
                 synth.onvoiceschanged = () => {
                     voices = synth.getVoices();
                     resolve(voices);
                 };
             }
         });
         const femaleVoice = voices.find(v => 
             v.name.includes('Female') || v.name.includes('Woman') || v.name.includes('Samantha')
         );
         currentVoice = femaleVoice || voices[0];
     } catch (e) {
         console.error('Error loading voices:', e);
     }
 }

 function speak(text) {
     return new Promise((resolve) => {
         if (synth.speaking) {
             synth.cancel();
             isSpeaking = false;
         }

         isSpeaking = true;
         const utterance = new SpeechSynthesisUtterance(text);
         utterance.voice = currentVoice;
         utterance.rate = 0.8;
         utterance.pitch = 1.4;

         utterance.onend = () => {
             isSpeaking = false;
             if (!isListening && !wasInterrupted) {
                 try {
                     recognition.start();
                 } catch (e) {
                     console.warn('Failed to restart recognition:', e);
                     setTimeout(() => {
                         if (!isListening && !isSpeaking && !wasInterrupted) {
                             try {
                                 recognition.start();
                             } catch (e) {
                                 console.warn('Retry failed:', e);
                             }
                         }
                     }, 1000);
                 }
             }
             resolve();
         };

         utterance.onerror = (event) => {
             if (event.error !== 'interrupted') {
                 console.error('Speech error:', event.error);
             }
             isSpeaking = false;
             if (!isListening && !wasInterrupted) {
                 try {
                     recognition.start();
                 } catch (e) {
                     console.warn('Failed to restart recognition:', e);
                     setTimeout(() => {
                         if (!isListening && !isSpeaking && !wasInterrupted) {
                             try {
                                 recognition.start();
                             } catch (e) {
                                 console.warn('Retry failed:', e);
                             }
                         }
                     }, 1000);
                 }
             }
             resolve();
         };

         try {
             synth.speak(utterance);
         } catch (e) {
             console.error('Error starting speech:', e);
             isSpeaking = false;
             resolve();
         }
     });
 }

 function stopSpeaking() {
     if (isSpeaking) {
         synth.cancel();
         isSpeaking = false;
         wasInterrupted = true;
     }
 }

 // Camera handling
 async function startWebcam() {
     try {
         const constraints = {
             video: {
                 facingMode: navigator.userAgent.match(/Mobi/) ? { ideal: 'environment' } : 'user'
             }
         };
         const stream = await navigator.mediaDevices.getUserMedia(constraints);
         webcam.srcObject = stream;
     } catch (error) {
         console.error('Error accessing webcam:', error);
         try {
             const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true });
             webcam.srcObject = fallbackStream;
         } catch (fallbackError) {
             console.error('Error accessing any camera:', fallbackError);
             speak('Unable to access camera').catch(() => {});
         }
     }
 }

 function captureImage() {
     if (!webcam.videoWidth) return null;
     const canvas = document.createElement('canvas');
     canvas.width = webcam.videoWidth;
     canvas.height = webcam.videoHeight;
     canvas.getContext('2d').drawImage(webcam, 0, 0);
     return canvas.toDataURL('image/jpeg').split(',')[1];
 }

 cameraButton.addEventListener('click', async () => {
     cameraOn = !cameraOn;
     if (cameraOn) {
         webcamContainer.style.display = 'flex';
         cameraButton.innerHTML = '<i class="fa-solid fa-video" style="color: #3b82f6;"></i>';
         await startWebcam();
         setInterval(() => {
             if (cameraOn && webcam.videoWidth > 0) lastCapturedImage = captureImage();
         }, 500);
     } else {
         webcamContainer.style.display = 'none';
         cameraButton.innerHTML = '<i class="fa-solid fa-video-slash" style="color: #3b82f6;"></i>';
         lastCapturedImage = null;
         if (webcam.srcObject) {
             webcam.srcObject.getTracks().forEach(track => track.stop());
         }
     }
 });

 // Chat history management
 function updateSideChat() {
     sideChat.innerHTML = '';
     chatHistory.forEach(message => {
         const div = document.createElement('div');
         div.textContent = `${message.role}: ${message.content}`;
         sideChat.appendChild(div);
     });
 }

 chatToggle.addEventListener('click', () => {
     sideChat.classList.toggle('open');
 });

 // Process commands
 async function processCommand(command) {
     if (!command.trim()) return;

     const lowerCommand = command.toLowerCase();
     if (lowerCommand.includes('stop listening')) {
         deactivateListening();
         chatHistory.push({ role: 'user', content: command });
         chatHistory.push({ role: 'assistant', content: 'I\'ve stopped listening' });
         addMessage(command, 'user');
         addMessage('I\'ve stopped listening', 'assistant');
         await speak('I\'ve stopped listening').catch(() => {});
         saveChatHistory();
         return;
     }

     chatHistory.push({ role: 'user', content: command });
     addMessage(command, 'user');

     try {
         let responseText;
         if (cameraOn && lastCapturedImage) {
             const response = await fetch(visionEndpoint, {
                 method: 'POST',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify({
                     contents: [{
                         parts: [
                             { text: `Your name is . Answer the following question based on the image and context: ${command}` },
                             { inlineData: { mimeType: 'image/jpeg', data: lastCapturedImage } }
                         ]
                     }]
                 })
             });
             const data = await response.json();
             if (!response.ok || !data.candidates) {
                 throw new Error(`Vision API error: ${response.status}`);
             }
             responseText = data.candidates[0].content.parts[0].text;
         } else {
             const context = chatHistory.map(c => `User: ${c.content}\n: ${c.response || ''}`).join('\n\n');
             const response = await fetch(`${textEndpoint}?key=${API_KEY}`, {
                 method: 'POST',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify({
                     contents: [{
                         parts: [{ text: context ? `${context}\n\n${command}` : command }]
                     }]
                 })
             });
             const data = await response.json();
             if (!response.ok || !data.candidates) {
                 throw new Error(`Text API error: ${response.status}`);
             }
             responseText = data.candidates[0].content.parts[0].text;
         }

         chatHistory.push({ role: 'assistant', content: responseText });
         addMessage(responseText, 'assistant');
         await speak(`${responseText}`).catch(() => {});
         saveChatHistory();
     } catch (error) {
         console.error('Error:', error);
         const errorMessage = 'Sorry, I couldn\'t process that request';
         chatHistory.push({ role: 'assistant', content: errorMessage });
         addMessage(errorMessage, 'assistant');
         await speak(`${errorMessage}`).catch(() => {});
         saveChatHistory();
     }
 }

 function addMessage(text, sender) {
     updateSideChat();
     saveChatHistory();
 }

 // Initialize
 window.onload = async () => {
     await loadVoices();
     initVoiceRecognition();
 };