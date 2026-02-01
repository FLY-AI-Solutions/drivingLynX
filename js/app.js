const app = {
    state: {
        currentUser: null,
        selectedMentor: null,
        selectedSlots: [],
        activeSession: null,
        sessionPoller: null,
        tempSelectedDates: [],
        currentRating: 0,
        localAvailability: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] },
        userRole: 'learner',
        hasCar: false,
        currentStep: 1,
        totalSteps: 4,
        scanner: null // Track scanner instance
    },

    init() {
        setTimeout(() => document.getElementById('splash').style.transform = 'translateY(-100%)', 1000);
        const user = storage.get('lynx_user');
        if (user) this.showDashboard(user);
    },

    // --- Auth & Registration ---
    async loginAction() {
        const email = document.getElementById('loginEmail').value;
        const pass = document.getElementById('loginPass').value;
        try {
            const data = await api.login(email, pass);
            storage.set('lynx_user', data.user);
            this.showDashboard(data.user);
            this.closeModal();
        } catch (e) { alert("Login failed"); }
    },

    async handleRegistration() {
        const btn = document.getElementById('nextBtn');
        if (!document.getElementById('regConsent').checked) return alert("Agree to terms required");
        btn.innerText = "Processing...";
        const payload = {
            role: this.state.userRole,
            first_name: document.getElementById('regFirst').value,
            last_name: document.getElementById('regLast').value,
            email: document.getElementById('regEmail').value,
            password: document.getElementById('regPass').value,
            license_number: document.getElementById('regLicense').value,
            address: document.getElementById('regAddress').value,
            city: document.getElementById('regCity').value,
            state: "NY",
            zip_code: document.getElementById('regZip').value,
            hourly_rate: parseFloat(document.getElementById('regRate').value || 0),
            has_car: this.state.hasCar,
            car_make_model: document.getElementById('regCarModel').value || null,
            car_plate: document.getElementById('regCarPlate').value || null
        };
        try {
            await api.register(payload);
            alert("Account created! Please login.");
            this.openModal('login');
        } catch (e) { alert(e.message); }
        btn.innerText = "FINISH REGISTRATION";
    },

    showDashboard(user) {
        this.state.currentUser = user;
        document.getElementById('landingView').classList.add('hidden');
        document.getElementById('dashboardView').classList.remove('hidden');
        document.getElementById('navAuthButtons').classList.add('hidden');
        document.getElementById('navUserArea').classList.remove('hidden');
        document.getElementById('userNameDisplay').innerText = user.first_name;
        document.getElementById('roleBadge').innerText = user.role;

        if (user.role === 'mentor') {
            document.getElementById('tabFind').classList.add('hidden');
            document.getElementById('tabRequests').classList.remove('hidden');
            document.getElementById('tabAvail').classList.remove('hidden');
            document.getElementById('tabUpcoming').classList.remove('hidden');
            this.switchTab('requests');
        } else {
            document.getElementById('tabFind').classList.remove('hidden');
            document.getElementById('tabRequests').classList.add('hidden');
            document.getElementById('tabAvail').classList.add('hidden');
            document.getElementById('tabUpcoming').classList.remove('hidden');
            this.switchTab('find');
            this.loadMentors();
        }
    },

    switchTab(tabId) {
        // Stop any active scanner or poller when switching tabs
        if (this.state.scanner) {
            this.state.scanner.clear();
            this.state.scanner = null;
        }
        if (tabId !== 'session' && this.state.sessionPoller) {
            clearInterval(this.state.sessionPoller);
            this.state.sessionPoller = null;
        }
        
        ui.switchTab(tabId, this.state.currentUser?.role);

        // Load Data
        if (tabId === 'requests') this.loadRequests();
        if (tabId === 'upcoming') this.loadUpcoming();
        if (tabId === 'avail') this.showAvailabilityEditor();
    },

    // --- Search & Booking ---
    async loadMentors() {
        const zip = document.getElementById('filterZip').value;
        const rate = document.getElementById('filterRate').value;
        try {
            const data = await api.getMentors(zip, rate);
            ui.renderMentors(data);
        } catch (e) { }
    },

    async openMentorProfile(id) {
        try {
            const data = await api.getMentorDetails(id);
            this.state.selectedMentor = data;
            document.getElementById('viewFind').classList.add('hidden');
            document.getElementById('viewProfile').classList.remove('hidden');
            this.state.selectedSlots = [];
            document.getElementById('selectedCount').innerText = "0";
            ui.renderProfile(data, data.availability, []);
        } catch (e) { alert(e.message); }
    },

    // --- Session Logic ---
    async loadUpcoming() {
        try {
            const data = await api.getUpcoming(this.state.currentUser.id, this.state.currentUser.role);
            ui.renderUpcoming(data);
        } catch (e) { document.getElementById('upcomingGrid').innerHTML = "Error loading schedule."; }
    },

    async enterSessionMode(sessionId) {
        if (!sessionId) return;
        document.getElementById('tabSession').classList.remove('hidden');
        
        // 1. Fetch Latest Status FIRST (Fixes QR disappearing bug)
        try {
            const fresh = await api.getSessionStatus(sessionId);
            this.state.activeSession = fresh;
        } catch (e) {
            this.state.activeSession = { id: sessionId, status: 'scheduled' }; // Fallback
        }
        
        // 2. Render UI
        ui.renderSessionStatus(this.state.activeSession, this.state.currentUser.role);
        
        // 3. Start Polling
        if (this.state.sessionPoller) clearInterval(this.state.sessionPoller);
        this.state.sessionPoller = setInterval(() => this.syncSessionStatus(), 5000);
        
        this.switchTab('session');
    },

    async syncSessionStatus() {
        if (!this.state.activeSession) return;
        try {
            const fresh = await api.getSessionStatus(this.state.activeSession.id);
            // Only re-render if status CHANGED (Prevents UI reset)
            if (fresh.status !== this.state.activeSession.status) {
                this.state.activeSession = fresh;
                ui.renderSessionStatus(this.state.activeSession, this.state.currentUser.role);
            }
        } catch (e) { console.log(e); }
    },

    async generateQR() {
        try {
            const data = await api.getQRToken(this.state.activeSession.id, this.state.currentUser.id);
            const canvas = document.getElementById('qrCanvas');
            canvas.innerHTML = "";
            new QRCode(canvas, { text: data.qr_string, width: 180, height: 180 });
            document.getElementById('qrContainer').classList.remove('hidden');
            document.getElementById('btnGenerateQR').classList.add('hidden');
        } catch (e) { alert("Error: " + e.message); }
    },

    // --- CAMERA LOGIC ---
    startScanner() {
        // 1. Show Container
        document.getElementById('scanContainer').classList.remove('hidden');
        document.getElementById('btnOpenScanner').classList.add('hidden');

        // 2. Ensure DOM Element exists (Rendered by ui.js)
        if(!document.getElementById('reader')) return alert("Scanner error: DOM missing");

        // 3. Init Library
        // If Html5QrcodeScanner is undefined, make sure the library is loaded in index.html
        try {
            this.state.scanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: 250 });
            
            // 4. Start Render
            this.state.scanner.render(
                (decodedText) => this.handleScanSuccess(decodedText),
                (error) => { /* Ignore frame errors */ }
            );
        } catch (e) {
            alert("Camera init failed. Ensure you are on HTTPS or localhost.");
        }
    },

    async handleScanSuccess(qrString) {
        if (this.state.scanner) {
            this.state.scanner.clear();
            this.state.scanner = null;
        }

        try {
            const data = await api.scanQR(this.state.currentUser.id, qrString);
            alert(data.message);
            // Immediate update
            if (data.message.includes("started")) this.state.activeSession.status = 'active';
            if (data.message.includes("ended")) this.state.activeSession.status = 'completed';
            ui.renderSessionStatus(this.state.activeSession, this.state.currentUser.role);
        } catch (e) { alert("Scan Failed: " + e.message); }
    },

    async processManualScan() {
        const token = document.getElementById('scanInput').value;
        this.handleScanSuccess(token);
    },

    async saveEvaluation() {
        const data = {
            steering: document.getElementById('evalSteering').checked,
            mirrors: document.getElementById('evalMirrors').checked,
            braking: document.getElementById('evalBraking').checked,
            signals: document.getElementById('evalSignals').checked
        };
        try {
            await api.saveEvaluation(this.state.activeSession.id, this.state.currentUser.id, data);
            alert("Evaluation Saved!");
        } catch (e) { alert("Save failed"); }
    },

    async submitRating() {
        if (this.state.currentRating === 0) return alert("Select stars");
        const comment = document.getElementById('ratingComment').value;
        try {
            await api.submitRating(this.state.activeSession.id, this.state.currentUser.id, this.state.currentRating, comment);
            alert("Rating Submitted!");
            this.exitSession();
        } catch (e) { alert("Submit failed"); }
    },

    exitSession() {
        if (this.state.scanner) { 
            this.state.scanner.clear(); 
            this.state.scanner = null; 
        }
        clearInterval(this.state.sessionPoller);
        this.state.activeSession = null;
        document.getElementById('tabSession').classList.add('hidden');
        this.switchTab('upcoming');
    },

    // --- Helpers (Date, Availability, etc) ---
    openDateModal(day, time) {
        this.state.tempSelectedDates = [...this.state.selectedSlots];
        const dates = ui.getNextFourDates(day, time);
        const container = document.getElementById('dateOptionsGrid');
        document.getElementById('dateModalTitle').innerText = `${day.toUpperCase()} @ ${time}`;

        container.innerHTML = dates.map(dateObj => {
            const iso = dateObj.toISOString().slice(0, 19);
            const isSelected = this.state.selectedSlots.some(s => s.startsWith(iso));
            return `
            <div onclick="app.toggleDateSelection('${iso}', this)" 
                 class="cursor-pointer p-4 rounded-xl border transition-all flex justify-between items-center ${isSelected ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'}">
                <span class="font-bold">${ui.formatDateNice(dateObj)}</span>
                <div class="w-4 h-4 rounded-full border ${isSelected ? 'bg-black border-black' : 'border-gray-500'}"></div>
            </div>`;
        }).join('');
        document.getElementById('dateModal').classList.replace('hidden', 'flex');
    },

    toggleDateSelection(iso, el) {
        const idx = this.state.tempSelectedDates.findIndex(s => s.startsWith(iso));
        if (idx > -1) {
            this.state.tempSelectedDates.splice(idx, 1);
            el.className = 'cursor-pointer p-4 rounded-xl border transition-all flex justify-between items-center bg-white/5 border-white/10 text-gray-300 hover:bg-white/10';
            el.querySelector('div').className = 'w-4 h-4 rounded-full border border-gray-500';
        } else {
            this.state.tempSelectedDates.push(iso);
            el.className = 'cursor-pointer p-4 rounded-xl border transition-all flex justify-between items-center bg-white text-black border-white';
            el.querySelector('div').className = 'w-4 h-4 rounded-full border bg-black border-black';
        }
    },

    confirmDateSelection() {
        this.state.selectedSlots = [...this.state.tempSelectedDates];
        document.getElementById('selectedCount').innerText = this.state.selectedSlots.length;
        this.closeDateModal();
        if (this.state.selectedMentor) ui.renderCalendar(this.state.selectedMentor.availability, this.state.selectedSlots);
    },

    proceedToPayment() {
        if(this.state.selectedSlots.length === 0) return alert("Select at least one slot.");
        document.getElementById('viewProfile').classList.add('hidden');
        document.getElementById('viewPayment').classList.remove('hidden');
        
        const count = this.state.selectedSlots.length;
        const rate = this.state.selectedMentor.hourly_rate;
        const subtotal = count * rate;
        
        document.getElementById('payCount').innerText = count;
        document.getElementById('payRate').innerText = `$${rate}`;
        document.getElementById('paySubtotal').innerText = `$${subtotal.toFixed(2)}`;
        document.getElementById('payTotal').innerText = `$${(subtotal+5).toFixed(2)}`;
    },

    async submitBooking() {
        try {
            const booking = await api.createBooking({
                mentor_id: this.state.selectedMentor.id,
                mentee_id: this.state.currentUser.id,
                datetime_slots: this.state.selectedSlots
            });
            await api.confirmPayment({
                session_ids: booking.booking_ids,
                payment_method_id: "pm_card_demo"
            });
            alert("Payment Successful!");
            this.switchTab('find');
        } catch (e) { alert("Transaction failed: " + e.message); }
    },

    showAvailabilityEditor() {
        if (this.state.currentUser.weekly_availability) {
            this.state.localAvailability = typeof this.state.currentUser.weekly_availability === 'string'
                ? JSON.parse(this.state.currentUser.weekly_availability)
                : this.state.currentUser.weekly_availability;
        }
        this.renderAvailabilityEditor();
    },

    renderAvailabilityEditor() {
        const container = document.getElementById('availabilityEditor');
        const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
        const times = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"];

        container.innerHTML = days.map(day => `
            <div class="border-b border-white/5 pb-4">
                <h4 class="uppercase text-xs font-bold text-gray-500 mb-3">${day}</h4>
                <div class="flex flex-wrap gap-2">
                    ${times.map(time => {
                        const isSelected = this.state.localAvailability[day] && this.state.localAvailability[day].includes(time);
                        return `<button onclick="app.toggleLocalSlot('${day}', '${time}')" class="px-3 py-1 rounded-md text-xs border ${isSelected ? 'bg-white text-black' : 'border-white/10 text-gray-400'}">${time}</button>`;
                    }).join('')}
                </div>
            </div>`).join('');
    },

    toggleLocalSlot(day, time) {
        if (!this.state.localAvailability[day]) this.state.localAvailability[day] = [];
        const index = this.state.localAvailability[day].indexOf(time);
        if (index > -1) this.state.localAvailability[day].splice(index, 1);
        else this.state.localAvailability[day].push(time);
        this.renderAvailabilityEditor();
    },

    async saveAvailability() {
        try {
            await api.updateAvailability(this.state.currentUser.id, this.state.localAvailability);
            alert("Availability Saved!");
            this.state.currentUser.weekly_availability = this.state.localAvailability;
            storage.set('lynx_user', this.state.currentUser);
        } catch (e) { alert("Save failed"); }
    },

    async loadRequests() {
        try {
            const data = await api.getRequests(this.state.currentUser.id);
            ui.renderRequests(data);
        } catch (e) { }
    },

    async handleRequest(sid, action) {
        try {
            await api.handleRequestAction(sid, this.state.currentUser.id, action);
            this.loadRequests();
        } catch (e) { alert("Action failed"); }
    },

    openModal(mode, role = 'learner') {
        document.getElementById('authModal').classList.replace('hidden', 'flex');
        const loginSec = document.getElementById('loginSection');
        const progress = document.getElementById('wizardProgress');
        const controls = document.getElementById('wizardControls');
        if (mode === 'login') {
            loginSec.classList.remove('hidden-section');
            progress.classList.add('hidden');
            controls.classList.add('hidden');
            document.querySelectorAll('.wizard-step').forEach(s => s.classList.add('hidden-section'));
        } else {
            this.state.userRole = role;
            loginSec.classList.add('hidden-section');
            progress.classList.remove('hidden');
            controls.classList.remove('hidden');
            const mentorFields = document.getElementById('mentorFields');
            if (mentorFields) mentorFields.style.display = role === 'mentor' ? 'block' : 'none';
            this.state.currentStep = 1;
            this.showStep(1);
        }
    },

    showStep(step) {
        document.querySelectorAll('.wizard-step').forEach(s => s.classList.add('hidden-section'));
        document.getElementById(`step${step}`).classList.remove('hidden-section');
        document.getElementById('stepCount').innerText = `${step}/${this.state.totalSteps}`;
        document.getElementById('progressBar').style.width = `${(step / this.state.totalSteps) * 100}%`;
        const nextBtn = document.getElementById('nextBtn');
        document.getElementById('backBtn').style.visibility = step === 1 ? 'hidden' : 'visible';
        nextBtn.innerText = step === this.state.totalSteps ? "FINISH REGISTRATION" : "CONTINUE";
    },

    changeStep(dir) {
        if (dir === 1) {
            if (this.state.currentStep < this.state.totalSteps) {
                this.state.currentStep++;
                this.showStep(this.state.currentStep);
            } else { this.handleRegistration(); }
        } else {
            this.state.currentStep--;
            this.showStep(this.state.currentStep);
        }
    },

    setHasCar(val) {
        this.state.hasCar = val;
        const yes = document.getElementById('carBtnYes');
        const no = document.getElementById('carBtnNo');
        const details = document.getElementById('carDetailsForm');
        yes.className = val ? "flex-1 p-4 rounded-xl bg-white text-black font-bold transition-all" : "flex-1 p-4 rounded-xl bg-white/5 border border-white/10 font-bold transition-all";
        no.className = !val ? "flex-1 p-4 rounded-xl bg-white text-black font-bold transition-all" : "flex-1 p-4 rounded-xl bg-white/5 border border-white/10 font-bold transition-all";
        val ? details.classList.remove('hidden') : details.classList.add('hidden');
    },

    setStar(n) {
        this.state.currentRating = n;
        document.querySelectorAll('.star-rating').forEach((s, i) => s.classList.toggle('active', i < n));
    },

    closeModal() { document.getElementById('authModal').classList.replace('flex', 'hidden'); },
    closeDateModal() { document.getElementById('dateModal').classList.replace('flex', 'hidden'); },
    logout() { storage.remove('lynx_user'); window.location.reload(); },
    goHome() { window.location.reload(); }
};

window.onload = () => app.init();

// const app = {
//     state: {
//         currentUser: null,
//         selectedMentor: null,
//         selectedSlots: [],
//         activeSession: null,
//         sessionPoller: null,
//         tempSelectedDates: [],
//         currentRating: 0,
//         localAvailability: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] },
//         // Reg Form State
//         userRole: 'learner',
//         hasCar: false,
//         currentStep: 1,
//         totalSteps: 4
//     },

//     init() {
//         setTimeout(() => document.getElementById('splash').style.transform = 'translateY(-100%)', 1000);
//         const user = storage.get('lynx_user');
//         if (user) this.showDashboard(user);
//     },

//     // --- Auth ---
//     async loginAction() {
//         const email = document.getElementById('loginEmail').value;
//         const pass = document.getElementById('loginPass').value;
//         try {
//             const data = await api.login(email, pass);
//             storage.set('lynx_user', data.user);
//             this.showDashboard(data.user);
//             this.closeModal();
//         } catch (e) { alert("Login failed"); }
//     },

//     async handleRegistration() {
//         const btn = document.getElementById('nextBtn');
//         if (!document.getElementById('regConsent').checked) return alert("Agree to terms required");
//         btn.innerText = "Processing...";
//         const payload = {
//             role: this.state.userRole,
//             first_name: document.getElementById('regFirst').value,
//             last_name: document.getElementById('regLast').value,
//             email: document.getElementById('regEmail').value,
//             password: document.getElementById('regPass').value,
//             license_number: document.getElementById('regLicense').value,
//             address: document.getElementById('regAddress').value,
//             city: document.getElementById('regCity').value,
//             state: "NY",
//             zip_code: document.getElementById('regZip').value,
//             hourly_rate: parseFloat(document.getElementById('regRate').value || 0),
//             has_car: this.state.hasCar,
//             car_make_model: document.getElementById('regCarModel').value || null,
//             car_plate: document.getElementById('regCarPlate').value || null
//         };
//         try {
//             await api.register(payload);
//             alert("Account created! Please login.");
//             this.openModal('login');
//         } catch (e) { alert(e.message); }
//         btn.innerText = "FINISH REGISTRATION";
//     },

//     showDashboard(user) {
//         this.state.currentUser = user;
//         document.getElementById('landingView').classList.add('hidden');
//         document.getElementById('dashboardView').classList.remove('hidden');
//         document.getElementById('navAuthButtons').classList.add('hidden');
//         document.getElementById('navUserArea').classList.remove('hidden');
//         document.getElementById('userNameDisplay').innerText = user.first_name;
//         document.getElementById('roleBadge').innerText = user.role;

//         if (user.role === 'mentor') {
//             document.getElementById('tabFind').classList.add('hidden');
//             document.getElementById('tabRequests').classList.remove('hidden');
//             document.getElementById('tabAvail').classList.remove('hidden');
//             document.getElementById('tabUpcoming').classList.remove('hidden');
//             this.switchTab('requests');
//         } else {
//             document.getElementById('tabFind').classList.remove('hidden');
//             document.getElementById('tabRequests').classList.add('hidden');
//             document.getElementById('tabAvail').classList.add('hidden');
//             document.getElementById('tabUpcoming').classList.remove('hidden');
//             this.switchTab('find');
//             this.loadMentors();
//         }
//     },

//     switchTab(tabId) {
//         if (tabId !== 'session' && this.state.sessionPoller) {
//             clearInterval(this.state.sessionPoller);
//             this.state.sessionPoller = null;
//         }
//         ui.switchTab(tabId, this.state.currentUser?.role);

//         // Load Data
//         if (tabId === 'requests') this.loadRequests();
//         if (tabId === 'upcoming') this.loadUpcoming();
//         if (tabId === 'avail') this.showAvailabilityEditor();
//     },

//     // --- Search & Booking ---
//     async loadMentors() {
//         const zip = document.getElementById('filterZip').value;
//         const rate = document.getElementById('filterRate').value;
//         try {
//             const data = await api.getMentors(zip, rate);
//             ui.renderMentors(data);
//         } catch (e) { }
//     },

//     async openMentorProfile(id) {
//         try {
//             const data = await api.getMentorDetails(id);
//             this.state.selectedMentor = data;
            
//             document.getElementById('viewFind').classList.add('hidden');
//             document.getElementById('viewProfile').classList.remove('hidden');
            
//             this.state.selectedSlots = [];
//             document.getElementById('selectedCount').innerText = "0";
//             ui.renderProfile(data, data.availability, []);
//         } catch (e) { alert(e.message); }
//     },

//     // --- Session Logic ---
//     async loadUpcoming() {
//         try {
//             const data = await api.getUpcoming(this.state.currentUser.id, this.state.currentUser.role);
//             ui.renderUpcoming(data);
//         } catch (e) { document.getElementById('upcomingGrid').innerHTML = "Error loading schedule."; }
//     },

//     enterSessionMode(sessionId) {
//         if (!sessionId) return;
//         document.getElementById('tabSession').classList.remove('hidden');
//         this.state.activeSession = { id: sessionId, status: 'scheduled' };
        
//         this.syncSessionStatus();
//         this.state.sessionPoller = setInterval(() => this.syncSessionStatus(), 5000);
        
//         this.switchTab('session');
//     },

//     async syncSessionStatus() {
//         if (!this.state.activeSession) return;
//         try {
//             const fresh = await api.getSessionStatus(this.state.activeSession.id);
//             if (fresh.status !== this.state.activeSession.status) {
//                 this.state.activeSession = fresh;
//             }
//             ui.renderSessionStatus(this.state.activeSession, this.state.currentUser.role);
//         } catch (e) { console.log(e); }
//     },

//     async generateQR() {
//         try {
//             const data = await api.getQRToken(this.state.activeSession.id, this.state.currentUser.id);
//             const canvas = document.getElementById('qrCanvas');
//             canvas.innerHTML = "";
//             new QRCode(canvas, { text: data.qr_string, width: 180, height: 180 });
//             document.getElementById('qrContainer').classList.remove('hidden');
//             document.getElementById('btnGenerateQR').classList.add('hidden');
//         } catch (e) { alert("Error: " + e.message); }
//     },

//     async processScan() {
//         const token = document.getElementById('scanInput').value;
//         try {
//             const data = await api.scanQR(this.state.currentUser.id, token);
//             alert(data.message);
//             if (data.message.includes("started")) this.state.activeSession.status = 'active';
//             if (data.message.includes("ended")) this.state.activeSession.status = 'completed';
//             ui.renderSessionStatus(this.state.activeSession, this.state.currentUser.role);
//         } catch (e) { alert("Scan Failed: " + e.message); }
//     },

//     async saveEvaluation() {
//         const data = {
//             steering: document.getElementById('evalSteering').checked,
//             mirrors: document.getElementById('evalMirrors').checked,
//             braking: document.getElementById('evalBraking').checked,
//             signals: document.getElementById('evalSignals').checked
//         };
//         try {
//             await api.saveEvaluation(this.state.activeSession.id, this.state.currentUser.id, data);
//             alert("Evaluation Saved!");
//         } catch (e) { alert("Save failed"); }
//     },

//     async submitRating() {
//         if (this.state.currentRating === 0) return alert("Select stars");
//         const comment = document.getElementById('ratingComment').value;
//         try {
//             await api.submitRating(this.state.activeSession.id, this.state.currentUser.id, this.state.currentRating, comment);
//             alert("Rating Submitted!");
//             this.exitSession();
//         } catch (e) { alert("Submit failed"); }
//     },

//     exitSession() {
//         clearInterval(this.state.sessionPoller);
//         this.state.activeSession = null;
//         document.getElementById('tabSession').classList.add('hidden');
//         this.switchTab('upcoming');
//     },

//     // --- Booking Helpers ---
//     openDateModal(day, time) {
//         this.state.tempSelectedDates = [...this.state.selectedSlots];
//         const dates = ui.getNextFourDates(day, time);
//         const container = document.getElementById('dateOptionsGrid');
//         document.getElementById('dateModalTitle').innerText = `${day.toUpperCase()} @ ${time}`;

//         container.innerHTML = dates.map(dateObj => {
//             const iso = dateObj.toISOString().slice(0, 19);
//             const isSelected = this.state.selectedSlots.some(s => s.startsWith(iso));
//             return `
//             <div onclick="app.toggleDateSelection('${iso}', this)" 
//                  class="cursor-pointer p-4 rounded-xl border transition-all flex justify-between items-center ${isSelected ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'}">
//                 <span class="font-bold">${ui.formatDateNice(dateObj)}</span>
//                 <div class="w-4 h-4 rounded-full border ${isSelected ? 'bg-black border-black' : 'border-gray-500'}"></div>
//             </div>`;
//         }).join('');
//         document.getElementById('dateModal').classList.replace('hidden', 'flex');
//     },

//     toggleDateSelection(iso, el) {
//         const idx = this.state.tempSelectedDates.findIndex(s => s.startsWith(iso));
//         if (idx > -1) {
//             this.state.tempSelectedDates.splice(idx, 1);
//             el.className = 'cursor-pointer p-4 rounded-xl border transition-all flex justify-between items-center bg-white/5 border-white/10 text-gray-300 hover:bg-white/10';
//             el.querySelector('div').className = 'w-4 h-4 rounded-full border border-gray-500';
//         } else {
//             this.state.tempSelectedDates.push(iso);
//             el.className = 'cursor-pointer p-4 rounded-xl border transition-all flex justify-between items-center bg-white text-black border-white';
//             el.querySelector('div').className = 'w-4 h-4 rounded-full border bg-black border-black';
//         }
//     },

//     confirmDateSelection() {
//         this.state.selectedSlots = [...this.state.tempSelectedDates];
//         document.getElementById('selectedCount').innerText = this.state.selectedSlots.length;
//         this.closeDateModal();
//         if (this.state.selectedMentor) ui.renderCalendar(this.state.selectedMentor.availability, this.state.selectedSlots);
//     },

//     proceedToPayment() {
//         if(this.state.selectedSlots.length === 0) return alert("Select at least one slot.");
//         document.getElementById('viewProfile').classList.add('hidden');
//         document.getElementById('viewPayment').classList.remove('hidden');
        
//         const count = this.state.selectedSlots.length;
//         const rate = this.state.selectedMentor.hourly_rate;
//         const subtotal = count * rate;
        
//         document.getElementById('payCount').innerText = count;
//         document.getElementById('payRate').innerText = `$${rate}`;
//         document.getElementById('paySubtotal').innerText = `$${subtotal.toFixed(2)}`;
//         document.getElementById('payTotal').innerText = `$${(subtotal+5).toFixed(2)}`;
//     },

//     async submitBooking() {
//         try {
//             const booking = await api.createBooking({
//                 mentor_id: this.state.selectedMentor.id,
//                 mentee_id: this.state.currentUser.id,
//                 datetime_slots: this.state.selectedSlots
//             });
//             await api.confirmPayment({
//                 session_ids: booking.booking_ids,
//                 payment_method_id: "pm_card_demo"
//             });
//             alert("Payment Successful!");
//             this.switchTab('find');
//         } catch (e) { alert("Transaction failed: " + e.message); }
//     },

//     // --- Availability ---
//     showAvailabilityEditor() {
//         if (this.state.currentUser.weekly_availability) {
//             this.state.localAvailability = typeof this.state.currentUser.weekly_availability === 'string'
//                 ? JSON.parse(this.state.currentUser.weekly_availability)
//                 : this.state.currentUser.weekly_availability;
//         }
//         this.renderAvailabilityEditor();
//     },

//     renderAvailabilityEditor() {
//         const container = document.getElementById('availabilityEditor');
//         const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
//         const times = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"];

//         container.innerHTML = days.map(day => `
//             <div class="border-b border-white/5 pb-4">
//                 <h4 class="uppercase text-xs font-bold text-gray-500 mb-3">${day}</h4>
//                 <div class="flex flex-wrap gap-2">
//                     ${times.map(time => {
//                         const isSelected = this.state.localAvailability[day] && this.state.localAvailability[day].includes(time);
//                         return `<button onclick="app.toggleLocalSlot('${day}', '${time}')" class="px-3 py-1 rounded-md text-xs border ${isSelected ? 'bg-white text-black' : 'border-white/10 text-gray-400'}">${time}</button>`;
//                     }).join('')}
//                 </div>
//             </div>`).join('');
//     },

//     toggleLocalSlot(day, time) {
//         if (!this.state.localAvailability[day]) this.state.localAvailability[day] = [];
//         const index = this.state.localAvailability[day].indexOf(time);
//         if (index > -1) this.state.localAvailability[day].splice(index, 1);
//         else this.state.localAvailability[day].push(time);
//         this.renderAvailabilityEditor();
//     },

//     async saveAvailability() {
//         try {
//             await api.updateAvailability(this.state.currentUser.id, this.state.localAvailability);
//             alert("Availability Saved!");
//             this.state.currentUser.weekly_availability = this.state.localAvailability;
//             storage.set('lynx_user', this.state.currentUser);
//         } catch (e) { alert("Save failed"); }
//     },

//     // --- Misc UI Handlers ---
//     openModal(mode, role = 'learner') {
//         document.getElementById('authModal').classList.replace('hidden', 'flex');
//         const loginSec = document.getElementById('loginSection');
//         const progress = document.getElementById('wizardProgress');
//         const controls = document.getElementById('wizardControls');
//         if (mode === 'login') {
//             loginSec.classList.remove('hidden-section');
//             progress.classList.add('hidden');
//             controls.classList.add('hidden');
//             document.querySelectorAll('.wizard-step').forEach(s => s.classList.add('hidden-section'));
//         } else {
//             this.state.userRole = role;
//             loginSec.classList.add('hidden-section');
//             progress.classList.remove('hidden');
//             controls.classList.remove('hidden');
//             const mentorFields = document.getElementById('mentorFields');
//             if (mentorFields) mentorFields.style.display = role === 'mentor' ? 'block' : 'none';
//             this.state.currentStep = 1;
//             this.showStep(1);
//         }
//     },

//     showStep(step) {
//         document.querySelectorAll('.wizard-step').forEach(s => s.classList.add('hidden-section'));
//         document.getElementById(`step${step}`).classList.remove('hidden-section');
//         document.getElementById('stepCount').innerText = `${step}/${this.state.totalSteps}`;
//         document.getElementById('progressBar').style.width = `${(step / this.state.totalSteps) * 100}%`;
//         const nextBtn = document.getElementById('nextBtn');
//         document.getElementById('backBtn').style.visibility = step === 1 ? 'hidden' : 'visible';
//         nextBtn.innerText = step === this.state.totalSteps ? "FINISH REGISTRATION" : "CONTINUE";
//     },

//     changeStep(dir) {
//         if (dir === 1) {
//             if (this.state.currentStep < this.state.totalSteps) {
//                 this.state.currentStep++;
//                 this.showStep(this.state.currentStep);
//             } else { this.handleRegistration(); }
//         } else {
//             this.state.currentStep--;
//             this.showStep(this.state.currentStep);
//         }
//     },

//     setHasCar(val) {
//         this.state.hasCar = val;
//         const yes = document.getElementById('carBtnYes');
//         const no = document.getElementById('carBtnNo');
//         const details = document.getElementById('carDetailsForm');
//         yes.className = val ? "flex-1 p-4 rounded-xl bg-white text-black font-bold transition-all" : "flex-1 p-4 rounded-xl bg-white/5 border border-white/10 font-bold transition-all";
//         no.className = !val ? "flex-1 p-4 rounded-xl bg-white text-black font-bold transition-all" : "flex-1 p-4 rounded-xl bg-white/5 border border-white/10 font-bold transition-all";
//         val ? details.classList.remove('hidden') : details.classList.add('hidden');
//     },

//     setStar(n) {
//         this.state.currentRating = n;
//         document.querySelectorAll('.star-rating').forEach((s, i) => s.classList.toggle('active', i < n));
//     },

//     async loadRequests() {
//         try {
//             const data = await api.getRequests(this.state.currentUser.id);
//             ui.renderRequests(data);
//         } catch (e) { }
//     },

//     async handleRequest(sid, action) {
//         try {
//             await api.handleRequestAction(sid, this.state.currentUser.id, action);
//             this.loadRequests();
//         } catch (e) { alert("Action failed"); }
//     },

//     closeModal() { document.getElementById('authModal').classList.replace('flex', 'hidden'); },
//     closeDateModal() { document.getElementById('dateModal').classList.replace('flex', 'hidden'); },
//     logout() { storage.remove('lynx_user'); window.location.reload(); },
//     goHome() { window.location.reload(); },
//     openScannerUI() { document.getElementById('scanContainer').classList.remove('hidden'); document.getElementById('btnOpenScanner').classList.add('hidden'); }
// };

// window.onload = () => app.init();
