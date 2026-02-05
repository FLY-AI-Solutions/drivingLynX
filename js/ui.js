const ui = {
    // --- Navigation (No Changes) ---
    switchTab(tabId, userRole) {
        const views = ['viewFind', 'viewProfile', 'viewPayment', 'viewRequests', 'viewSession', 'viewManageAvailability', 'viewUpcoming', 'viewRates', 'viewPolicy'];
        views.forEach(id => document.getElementById(id).classList.add('hidden'));

        const tabs = ['tabFind', 'tabRequests', 'tabSession', 'tabAvail', 'tabUpcoming', 'tabRates', 'tabPolicy'];
        tabs.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.className = 'text-gray-500 font-bold border-b-2 border-transparent pb-4 whitespace-nowrap';
        });

        if (userRole !== 'mentor') {
            document.getElementById('tabRequests').classList.add('hidden');
            document.getElementById('tabAvail').classList.add('hidden');
            document.getElementById('tabRates').classList.add('hidden');
        }

        const map = {
            'find': 'viewFind', 'requests': 'viewRequests', 'session': 'viewSession',
            'avail': 'viewManageAvailability', 'upcoming': 'viewUpcoming', 'rates': 'viewRates', 'policy': 'viewPolicy'
        };
        
        if (map[tabId]) {
            document.getElementById(map[tabId]).classList.remove('hidden');
            const btn = document.getElementById('tab' + tabId.charAt(0).toUpperCase() + tabId.slice(1));
            if(btn) btn.className = 'text-white font-bold border-b-2 border-white pb-4 whitespace-nowrap';
        }
    },

    // --- Renderers ---
    renderUpcoming(data) {
        const grid = document.getElementById('upcomingGrid');
        if (!data || data.length === 0) {
            grid.innerHTML = "<div class='text-gray-500 text-center'>No upcoming sessions found.</div>";
            return;
        }
        grid.innerHTML = data.map(s => {
            const d = new Date(s.scheduled_datetime);
            return `
            <div onclick="app.enterSessionMode(${s.id})" class="glass-panel p-6 border-l-4 border-blue-500 cursor-pointer hover:bg-white/5 transition">
                <div class="flex justify-between items-start">
                    <div>
                        <div class="font-bold text-blue-400 uppercase text-xs mb-1">${d.toLocaleDateString()}</div>
                        <div class="text-2xl font-black text-white">${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                        <div class="text-gray-400 text-sm mt-1">with ${s.partner_name}</div>
                    </div>
                    <div class="bg-blue-500/20 text-blue-300 text-[10px] font-bold px-2 py-1 rounded border border-blue-500/30">
                        ${s.status.toUpperCase()}
                    </div>
                </div>
                <div class="mt-4 text-xs font-bold text-right text-gray-500">CLICK TO ENTER ></div>
            </div>`;
        }).join('');
    },

    renderMentors(data) {
        const grid = document.getElementById('mentorGrid');
        if (!data || data.length === 0) {
            grid.innerHTML = "<div class='text-gray-500 text-center'>No mentors available yet.</div>";
            return;
        }
        grid.innerHTML = data.map(m => {
            const rates = [m.hourly_rate_without_car || 0, m.hourly_rate_with_car || 0].filter(r => r > 0);
            const fromRate = rates.length ? Math.min(...rates) : 0;
            return `
            <div class="glass-panel p-6">
                <div class="flex justify-between mb-2">
                    <h3 class="font-bold">${m.first_name} ${m.last_name}</h3>
                    <span class="text-green-400 font-bold">From $${fromRate}</span>
                </div>
                <p class="text-xs text-gray-400 mb-4">${m.city || 'NY'}</p>
                <p class="text-[10px] text-gray-500 mb-4">With Car: $${m.hourly_rate_with_car || 0}/hr · Without Car: $${m.hourly_rate_without_car || 0}/hr</p>
                <button onclick="app.openMentorProfile(${m.id})" class="btn-silver w-full py-2 text-xs">REQUEST SESSION</button>
            </div>`;
        }).join('');
    },

    // --- UPDATED: Requests View with Payout Reminder ---
    renderRequests(data, currentUser) {
        const grid = document.getElementById('requestsGrid');
        grid.innerHTML = ""; // Clear current

        // 1. Check for Payout Issue (Mentor + Charging Money + Not Onboarded)
        // We assume "Helping Mode" means hourly_rate is 0.
        if (currentUser.role === 'mentor' && currentUser.hourly_rate > 0 && !currentUser.stripe_onboarding_complete) {
            grid.innerHTML += `
            <div class="bg-orange-500/10 border border-orange-500/30 p-6 rounded-xl mb-6 relative overflow-hidden">
                <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative z-10">
                    <div>
                        <h3 class="text-orange-400 font-bold text-lg flex items-center gap-2">
                            ⚠️ Payments Not Configured
                        </h3>
                        <p class="text-sm text-gray-300 mt-1">
                            You cannot receive paid booking requests until you set up payouts.
                        </p>
                    </div>
                    <div class="flex flex-col w-full md:w-auto gap-2">
                        <button onclick="app.startStripeOnboarding()" class="bg-orange-500 hover:bg-orange-400 text-black font-bold py-2 px-4 rounded text-xs transition-colors">
                            SETUP PAYOUTS
                        </button>
                        <button onclick="app.activateHelpingMode()" class="text-orange-400 hover:text-white text-xs font-bold underline py-1">
                            Switch to "Helping Mode" (Volunteer)
                        </button>
                    </div>
                </div>
            </div>`;
        } else if (currentUser.role === 'mentor' && currentUser.hourly_rate === 0) {
             // Optional: Show a badge that they are in Helping Mode
             grid.innerHTML += `
             <div class="bg-blue-500/10 border border-blue-500/30 p-4 rounded-xl mb-6 flex justify-between items-center">
                <div class="flex items-center gap-3">
                    <span class="text-2xl">🤝</span>
                    <div>
                        <h3 class="text-blue-400 font-bold text-sm">Helping Mode Active</h3>
                        <p class="text-[10px] text-gray-400">You are volunteering your time. Thank you!</p>
                    </div>
                </div>
                <button onclick="alert('To charge for sessions, please update your profile rate.')" class="text-xs text-gray-500 hover:text-white">Change</button>
             </div>`;
        }

        // 2. Render Requests
        const pending = data.filter(r => r.status === 'pending');

        if (pending.length === 0) { 
            grid.innerHTML += "<div class='text-gray-500 text-center py-8'>No pending requests.</div>"; 
            return; 
        }

        grid.innerHTML += pending.map(r => `
            <div class="glass-panel p-4 flex justify-between items-center">
                <div>
                    <h4 class="font-bold text-white">${r.mentee_name}</h4>
                    <p class="text-xs text-gray-400">Scheduled: ${new Date(r.scheduled).toLocaleString()}</p>
                    <span class="text-[10px] bg-yellow-500/20 text-yellow-500 px-2 py-0.5 rounded">PENDING</span>
                </div>
                <div class="flex gap-2">
                    <button onclick="app.handleRequest(${r.session_id}, 'accept')" class="bg-green-500/20 text-green-400 px-4 py-2 rounded-lg text-xs font-bold border border-green-500/50 hover:bg-green-500/30">ACCEPT</button>
                    <button onclick="app.handleRequest(${r.session_id}, 'reject')" class="bg-red-500/20 text-red-400 px-4 py-2 rounded-lg text-xs font-bold border border-red-500/50 hover:bg-red-500/30">REJECT</button>
                </div>
            </div>`).join('');
    },
    // ... (Keep existing profile/calendar/session renderers) ...
    renderProfile(data, availability, selectedSlots) {
        document.getElementById('profileName').innerText = `${data.first_name} ${data.last_name}`;
        const rateWithCar = data.hourly_rate_with_car || 0;
        const rateWithoutCar = data.hourly_rate_without_car || 0;
        const rateDisplay = `With Car: $${rateWithCar}/hr · Without Car: $${rateWithoutCar}/hr`;
        document.getElementById('profileRate').innerText = rateDisplay;
        const initials = document.getElementById('profileInitials');
        const photo = document.getElementById('profilePhoto');
        if (data.profile_photo) {
            photo.src = data.profile_photo;
            photo.classList.remove('hidden');
            initials.classList.add('bg-transparent');
            initials.childNodes.forEach(node => {
                if (node.nodeType === Node.TEXT_NODE) node.textContent = '';
            });
        } else {
            photo.classList.add('hidden');
            initials.textContent = data.first_name[0];
        }
        document.getElementById('profileCar').innerText = data.car || "Uses Student Car";

        const setBar = (id, val, max = 5) => {
            const pct = (val / max) * 100;
            setTimeout(() => document.getElementById(id).style.width = `${pct}%`, 100);
        };
        setBar('barTemper', data.ratings.temper);
        document.getElementById('valTemper').innerText = data.ratings.temper === 5 ? "Friendly" : (data.ratings.temper === 0 ? "Strict" : "Normal");
        setBar('barSkills', data.ratings.skills);
        document.getElementById('valSkills').innerText = `${data.ratings.skills}/5`;
        setBar('barKnowledge', data.ratings.knowledge);
        document.getElementById('valKnowledge').innerText = `${data.ratings.knowledge}/5`;

        this.renderCalendar(availability, selectedSlots);
    },

    renderCalendar(avail, selectedSlots) {
        const grid = document.getElementById('calendarGrid');
        grid.innerHTML = '';
        const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
        const timeSlots = ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'];

        timeSlots.forEach(time => {
            days.forEach(day => {
                const div = document.createElement('div');
                const isAvail = avail[day] && avail[day].includes(time);
                const isActive = selectedSlots.some(s => {
                    const d = new Date(s);
                    const dIndex = d.getDay(); 
                    const dName = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][dIndex];
                    const dTime = d.toTimeString().substring(0, 5);
                    return dName === day && dTime === time;
                });

                div.className = `cal-slot ${isAvail ? '' : 'unavailable'} ${isActive ? 'selected' : ''}`;
                div.innerText = `${time}`;

                if (isAvail) div.onclick = () => app.openDateModal(day, time);
                grid.appendChild(div);
            });
        });
    },

    renderSessionStatus(session, role) {
        const header = document.getElementById('sessionHeader');
        const instr = document.getElementById('sessionInstruction');
        const badge = document.getElementById('sessionStateBadge');
        const btnQR = document.getElementById('btnGenerateQR');
        const btnScan = document.getElementById('btnOpenScanner');
        const scanContainer = document.getElementById('scanContainer');
        const evalForm = document.getElementById('mentorEvalForm');
        const rateForm = document.getElementById('ratingForm');

        // Reset visibility
        if (!scanContainer.innerHTML.includes("reader")) {
             scanContainer.classList.add('hidden');
        }
        document.getElementById('qrContainer').classList.add('hidden');
        btnQR.classList.add('hidden');
        btnScan.classList.add('hidden');
        evalForm.classList.add('hidden');
        rateForm.classList.add('hidden');

        badge.innerText = session.status.toUpperCase();

        if (session.status === 'accepted' || session.status === 'scheduled') {
            badge.className = "px-2 py-1 rounded bg-yellow-500/20 text-yellow-500 text-[10px] font-bold";
            header.innerText = "Start Session";
            
            if (role === 'mentor') {
                instr.innerText = "Generate Start Code for student.";
                btnQR.classList.remove('hidden');
                btnQR.innerText = "GENERATE START CODE";
            } else {
                instr.innerText = "Scan Mentor's Start Code.";
                btnScan.classList.remove('hidden');
                btnScan.onclick = () => app.startScanner(); 
                this.setupScannerDOM(scanContainer);
            }
        } else if (session.status === 'active') {
            badge.className = "px-2 py-1 rounded bg-green-500/20 text-green-500 text-[10px] font-bold";
            header.innerText = "Driving in Progress";
            
            if (role === 'mentor') {
                instr.innerText = "Scan Student's QR to finish.";
                evalForm.classList.remove('hidden');
                btnScan.classList.remove('hidden');
                btnScan.onclick = () => app.startScanner(); 
                this.setupScannerDOM(scanContainer);
            } else {
                instr.innerText = "Show this code to Mentor to finish.";
                btnQR.classList.remove('hidden');
                btnQR.innerText = "GENERATE FINISH CODE";
            }
        } else if (session.status === 'completed') {
            badge.className = "px-2 py-1 rounded bg-blue-500/20 text-blue-500 text-[10px] font-bold";
            header.innerText = "Session Completed";
            instr.innerText = "Please rate your partner.";
            rateForm.classList.remove('hidden');
        }
    },

    setupScannerDOM(container) {
        if (!document.getElementById('reader')) {
            container.innerHTML = `
                <div id="reader" style="width: 100%; border-radius: 12px; overflow: hidden;"></div>
                <button onclick="app.toggleManualScanInput()" class="text-xs text-gray-500 mt-2 underline block mx-auto">Use Manual Input</button>
                <input type="text" id="scanInput" class="hidden lynx-input mt-2 text-center" placeholder="Paste Token"> 
                <button id="scanSubmitBtn" onclick="app.processManualScan()" class="hidden btn-silver w-full py-2 mt-2 text-xs">SUBMIT TOKEN</button>
            `;
        }
    },

    formatDateNice: (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    
    getNextFourDates(dayName, timeStr) {
        const daysMap = { 'sun': 0, 'mon': 1, 'tue': 2, 'wed': 3, 'thu': 4, 'fri': 5, 'sat': 6 };
        const targetDay = daysMap[dayName.toLowerCase()];
        const dates = [];
        const today = new Date();
        let current = new Date(today);
        current.setDate(current.getDate() + 1);
        while (current.getDay() !== targetDay) { current.setDate(current.getDate() + 1); }
        for (let i = 0; i < 4; i++) {
            const [hours, mins] = timeStr.split(':');
            const slotDate = new Date(current);
            slotDate.setHours(parseInt(hours), parseInt(mins), 0, 0);
            dates.push(slotDate);
            current.setDate(current.getDate() + 7);
        }
        return dates;
    }
};


// const ui = {
//     // --- Navigation ---
//     switchTab(tabId, userRole) {
//         const views = ['viewFind', 'viewProfile', 'viewPayment', 'viewRequests', 'viewSession', 'viewManageAvailability', 'viewUpcoming'];
//         views.forEach(id => document.getElementById(id).classList.add('hidden'));

//         const tabs = ['tabFind', 'tabRequests', 'tabSession', 'tabAvail', 'tabUpcoming'];
//         tabs.forEach(id => {
//             const el = document.getElementById(id);
//             if (el) el.className = 'text-gray-500 font-bold border-b-2 border-transparent pb-4 whitespace-nowrap';
//         });

//         if (userRole !== 'mentor') {
//             document.getElementById('tabRequests').classList.add('hidden');
//             document.getElementById('tabAvail').classList.add('hidden');
//         }

//         const map = {
//             'find': 'viewFind', 'requests': 'viewRequests', 'session': 'viewSession',
//             'avail': 'viewManageAvailability', 'upcoming': 'viewUpcoming'
//         };
        
//         if (map[tabId]) {
//             document.getElementById(map[tabId]).classList.remove('hidden');
//             const btn = document.getElementById('tab' + tabId.charAt(0).toUpperCase() + tabId.slice(1));
//             if(btn) btn.className = 'text-white font-bold border-b-2 border-white pb-4 whitespace-nowrap';
//         }
//     },

//     // --- Renderers ---
//     renderUpcoming(data) {
//         const grid = document.getElementById('upcomingGrid');
//         if (!data || data.length === 0) {
//             grid.innerHTML = "<div class='text-gray-500 text-center'>No upcoming sessions found.</div>";
//             return;
//         }
//         grid.innerHTML = data.map(s => {
//             const d = new Date(s.scheduled_datetime);
//             return `
//             <div onclick="app.enterSessionMode(${s.id})" class="glass-panel p-6 border-l-4 border-blue-500 cursor-pointer hover:bg-white/5 transition">
//                 <div class="flex justify-between items-start">
//                     <div>
//                         <div class="font-bold text-blue-400 uppercase text-xs mb-1">${d.toLocaleDateString()}</div>
//                         <div class="text-2xl font-black text-white">${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
//                         <div class="text-gray-400 text-sm mt-1">with ${s.partner_name}</div>
//                     </div>
//                     <div class="bg-blue-500/20 text-blue-300 text-[10px] font-bold px-2 py-1 rounded border border-blue-500/30">
//                         ${s.status.toUpperCase()}
//                     </div>
//                 </div>
//                 <div class="mt-4 text-xs font-bold text-right text-gray-500">CLICK TO ENTER ></div>
//             </div>`;
//         }).join('');
//     },

//     renderMentors(data) {
//         const grid = document.getElementById('mentorGrid');
//         grid.innerHTML = data.map(m => `
//             <div class="glass-panel p-6">
//                 <div class="flex justify-between mb-2"><h3 class="font-bold">${m.first_name} ${m.last_name}</h3><span class="text-green-400 font-bold">$${m.hourly_rate}</span></div>
//                 <p class="text-xs text-gray-400 mb-4">${m.city || 'NY'}</p>
//                 <button onclick="app.openMentorProfile(${m.id})" class="btn-silver w-full py-2 text-xs">REQUEST SESSION</button>
//             </div>`).join('');
//     },

//     renderRequests(data) {
//         const grid = document.getElementById('requestsGrid');
        
//         // FILTER: Only show pending items. Accepted ones are in 'Upcoming'.
//         const pending = data.filter(r => r.status === 'pending');

//         if (pending.length === 0) { 
//             grid.innerHTML = "<div class='text-gray-500 text-center py-8'>No pending requests.</div>"; 
//             return; 
//         }

//         grid.innerHTML = pending.map(r => `
//             <div class="glass-panel p-4 flex justify-between items-center">
//                 <div>
//                     <h4 class="font-bold text-white">${r.mentee_name}</h4>
//                     <p class="text-xs text-gray-400">Scheduled: ${new Date(r.scheduled).toLocaleString()}</p>
//                     <span class="text-[10px] bg-yellow-500/20 text-yellow-500 px-2 py-0.5 rounded">PENDING</span>
//                 </div>
//                 <div class="flex gap-2">
//                     <button onclick="app.handleRequest(${r.session_id}, 'accept')" class="bg-green-500/20 text-green-400 px-4 py-2 rounded-lg text-xs font-bold border border-green-500/50 hover:bg-green-500/30">ACCEPT</button>
//                     <button onclick="app.handleRequest(${r.session_id}, 'reject')" class="bg-red-500/20 text-red-400 px-4 py-2 rounded-lg text-xs font-bold border border-red-500/50 hover:bg-red-500/30">REJECT</button>
//                 </div>
//             </div>`).join('');
//     },

//     renderProfile(data, availability, selectedSlots) {
//         document.getElementById('profileName').innerText = `${data.first_name} ${data.last_name}`;
//         document.getElementById('profileRate').innerText = `$${data.hourly_rate}/hr`;
//         document.getElementById('profileInitials').innerText = data.first_name[0];
//         document.getElementById('profileCar').innerText = data.car || "Uses Student Car";

//         const setBar = (id, val, max = 5) => {
//             const pct = (val / max) * 100;
//             setTimeout(() => document.getElementById(id).style.width = `${pct}%`, 100);
//         };
//         setBar('barTemper', data.ratings.temper);
//         document.getElementById('valTemper').innerText = data.ratings.temper === 5 ? "Friendly" : (data.ratings.temper === 0 ? "Strict" : "Normal");
//         setBar('barSkills', data.ratings.skills);
//         document.getElementById('valSkills').innerText = `${data.ratings.skills}/5`;
//         setBar('barKnowledge', data.ratings.knowledge);
//         document.getElementById('valKnowledge').innerText = `${data.ratings.knowledge}/5`;

//         this.renderCalendar(availability, selectedSlots);
//     },

//     renderCalendar(avail, selectedSlots) {
//         const grid = document.getElementById('calendarGrid');
//         grid.innerHTML = '';
//         const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
//         const timeSlots = ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'];

//         timeSlots.forEach(time => {
//             days.forEach(day => {
//                 const div = document.createElement('div');
//                 const isAvail = avail[day] && avail[day].includes(time);
//                 const isActive = selectedSlots.some(s => {
//                     const d = new Date(s);
//                     const dIndex = d.getDay(); 
//                     const dName = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][dIndex];
//                     const dTime = d.toTimeString().substring(0, 5);
//                     return dName === day && dTime === time;
//                 });

//                 div.className = `cal-slot ${isAvail ? '' : 'unavailable'} ${isActive ? 'selected' : ''}`;
//                 div.innerText = `${time}`;

//                 if (isAvail) div.onclick = () => app.openDateModal(day, time);
//                 grid.appendChild(div);
//             });
//         });
//     },

//     // --- Session Status Renderer ---
//     renderSessionStatus(session, role) {
//         const header = document.getElementById('sessionHeader');
//         const instr = document.getElementById('sessionInstruction');
//         const badge = document.getElementById('sessionStateBadge');
//         const btnQR = document.getElementById('btnGenerateQR');
//         const btnScan = document.getElementById('btnOpenScanner');
//         const scanContainer = document.getElementById('scanContainer');
//         const evalForm = document.getElementById('mentorEvalForm');
//         const rateForm = document.getElementById('ratingForm');

//         // Reset visibility
//         if (!scanContainer.innerHTML.includes("reader")) {
//              scanContainer.classList.add('hidden');
//         }
//         document.getElementById('qrContainer').classList.add('hidden');
//         btnQR.classList.add('hidden');
//         btnScan.classList.add('hidden');
//         evalForm.classList.add('hidden');
//         rateForm.classList.add('hidden');

//         badge.innerText = session.status.toUpperCase();

//         // 1. Scheduled / Accepted State
//         if (session.status === 'accepted' || session.status === 'scheduled') {
//             badge.className = "px-2 py-1 rounded bg-yellow-500/20 text-yellow-500 text-[10px] font-bold";
//             header.innerText = "Start Session";
            
//             if (role === 'mentor') {
//                 instr.innerText = "Generate Start Code for student.";
//                 btnQR.classList.remove('hidden');
//                 btnQR.innerText = "GENERATE START CODE";
//             } else {
//                 instr.innerText = "Scan Mentor's Start Code.";
//                 btnScan.classList.remove('hidden');
//                 btnScan.onclick = () => app.startScanner(); // FIX: Attach click handler
//                 this.setupScannerDOM(scanContainer);
//             }
        
//         // 2. Active State
//         } else if (session.status === 'active') {
//             badge.className = "px-2 py-1 rounded bg-green-500/20 text-green-500 text-[10px] font-bold";
//             header.innerText = "Driving in Progress";
            
//             if (role === 'mentor') {
//                 instr.innerText = "Scan Student's QR to finish.";
//                 evalForm.classList.remove('hidden');
//                 btnScan.classList.remove('hidden');
//                 btnScan.onclick = () => app.startScanner(); // FIX: Attach click handler
//                 this.setupScannerDOM(scanContainer);
//             } else {
//                 instr.innerText = "Show this code to Mentor to finish.";
//                 btnQR.classList.remove('hidden');
//                 btnQR.innerText = "GENERATE FINISH CODE";
//             }

//         // 3. Completed State
//         } else if (session.status === 'completed') {
//             badge.className = "px-2 py-1 rounded bg-blue-500/20 text-blue-500 text-[10px] font-bold";
//             header.innerText = "Session Completed";
//             instr.innerText = "Please rate your partner.";
//             rateForm.classList.remove('hidden');
//         }
//     },

//     setupScannerDOM(container) {
//         if (!document.getElementById('reader')) {
//             container.innerHTML = `
//                 <div id="reader" style="width: 100%; border-radius: 12px; overflow: hidden;"></div>
//                 <button onclick="app.processManualScan()" class="text-xs text-gray-500 mt-2 underline block mx-auto">Use Manual Input</button>
//                 <input type="text" id="scanInput" class="hidden lynx-input mt-2 text-center" placeholder="Paste Token"> 
//             `;
//         }
//     },

//     formatDateNice: (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    
//     getNextFourDates(dayName, timeStr) {
//         const daysMap = { 'sun': 0, 'mon': 1, 'tue': 2, 'wed': 3, 'thu': 4, 'fri': 5, 'sat': 6 };
//         const targetDay = daysMap[dayName.toLowerCase()];
//         const dates = [];
//         const today = new Date();
//         let current = new Date(today);
//         current.setDate(current.getDate() + 1);
//         while (current.getDay() !== targetDay) { current.setDate(current.getDate() + 1); }
//         for (let i = 0; i < 4; i++) {
//             const [hours, mins] = timeStr.split(':');
//             const slotDate = new Date(current);
//             slotDate.setHours(parseInt(hours), parseInt(mins), 0, 0);
//             dates.push(slotDate);
//             current.setDate(current.getDate() + 7);
//         }
//         return dates;
//     }
// };
