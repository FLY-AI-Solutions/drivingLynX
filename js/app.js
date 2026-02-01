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
        scanner: null,
        stripe: null,
        cardElement: null
    },

    init() {
        setTimeout(() => document.getElementById('splash').style.transform = 'translateY(-100%)', 1000);
        const user = storage.get('lynx_user');
        if (user) {
            this.showDashboard(user);
            // Background check for updated stripe status
            if (user.role === 'mentor' && !user.stripe_onboarding_complete) {
                api.checkStripeStatus(user.id).then(status => {
                    if (status.details_submitted) {
                        user.stripe_onboarding_complete = true;
                        storage.set('lynx_user', user);
                        this.state.currentUser = user;
                    }
                });
            }
        }
        this.initStripe();
    },

    initStripe() {
        if (window.Stripe) {
            this.state.stripe = Stripe('pk_test_TYooMQauvdEDq54NiTphI7jx'); // REPLACE WITH YOUR KEY
            const elements = this.state.stripe.elements();
            this.state.cardElement = elements.create('card', {
                style: {
                    base: {
                        color: "#ffffff",
                        fontFamily: '"Inter", sans-serif',
                        fontSmoothing: "antialiased",
                        fontSize: "16px",
                        "::placeholder": { color: "#aab7c4" }
                    },
                    invalid: { color: "#fa755a", iconColor: "#fa755a" }
                }
            });
        }
    },

    // --- PAYOUTS & HELPING MODE ---
    async startStripeOnboarding() {
        try {
            const data = await api.createOnboardingLink(this.state.currentUser.id);
            window.location.href = data.url; // Redirect to Stripe
        } catch (e) {
            alert("Error: " + e.message);
        }
    },

    async activateHelpingMode() {
        if (!confirm("Are you sure? Switching to Helping Mode sets your rate to $0 (Volunteer). You can change this later in settings.")) return;
        
        try {
            // Update rate to 0
            await api.updateUser(this.state.currentUser.id, { hourly_rate: 0 });
            
            // Update local state
            this.state.currentUser.hourly_rate = 0;
            storage.set('lynx_user', this.state.currentUser);
            
            // Refresh View
            alert("You are now a Volunteer! Helping Mode Active.");
            this.loadRequests(); 
        } catch (e) {
            alert("Could not update profile. (Backend endpoint for update might be missing)");
        }
    },

    // --- Auth ---
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
        if (this.state.scanner) {
            this.state.scanner.clear();
            this.state.scanner = null;
        }
        if (tabId !== 'session' && this.state.sessionPoller) {
            clearInterval(this.state.sessionPoller);
            this.state.sessionPoller = null;
        }
        
        ui.switchTab(tabId, this.state.currentUser?.role);

        if (tabId === 'requests') this.loadRequests();
        if (tabId === 'upcoming') this.loadUpcoming();
        if (tabId === 'avail') this.showAvailabilityEditor();
    },

    async loadRequests() {
        try {
            const data = await api.getRequests(this.state.currentUser.id);
            // Pass Current User to renderer so it can check onboarding status
            ui.renderRequests(data, this.state.currentUser);
        } catch (e) { }
    },

    // ... (Keep existing loadMentors, openMentorProfile, loadUpcoming, enterSessionMode, etc.) ...
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

    async loadUpcoming() {
        try {
            const data = await api.getUpcoming(this.state.currentUser.id, this.state.currentUser.role);
            ui.renderUpcoming(data);
        } catch (e) { document.getElementById('upcomingGrid').innerHTML = "Error loading schedule."; }
    },

    async enterSessionMode(sessionId) {
        if (!sessionId) return;
        document.getElementById('tabSession').classList.remove('hidden');
        try {
            const fresh = await api.getSessionStatus(sessionId);
            this.state.activeSession = fresh;
        } catch (e) {
            this.state.activeSession = { id: sessionId, status: 'scheduled' }; 
        }
        ui.renderSessionStatus(this.state.activeSession, this.state.currentUser.role);
        if (this.state.sessionPoller) clearInterval(this.state.sessionPoller);
        this.state.sessionPoller = setInterval(() => this.syncSessionStatus(), 5000);
        this.switchTab('session');
    },

    async syncSessionStatus() {
        if (!this.state.activeSession) return;
        try {
            const fresh = await api.getSessionStatus(this.state.activeSession.id);
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

    startScanner() {
        document.getElementById('scanContainer').classList.remove('hidden');
        document.getElementById('btnOpenScanner').classList.add('hidden');
        if(!document.getElementById('reader')) return alert("Scanner DOM error. Try refreshing.");
        try {
            if (!this.state.scanner) {
                this.state.scanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: 250 });
            }
            this.state.scanner.render(
                (decodedText) => this.handleScanSuccess(decodedText),
                (error) => { }
            );
        } catch (e) { alert("Camera failed. Check permissions."); }
    },

    async handleScanSuccess(qrString) {
        if (this.state.scanner) {
            this.state.scanner.clear();
            this.state.scanner = null;
        }
        try {
            const data = await api.scanQR(this.state.currentUser.id, qrString);
            alert(data.message);
            if (data.message.includes("Started") || data.message.includes("Active")) this.state.activeSession.status = 'active';
            if (data.message.includes("Ended")) this.state.activeSession.status = 'completed';
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

        if (this.state.cardElement) {
            this.state.cardElement.mount('#card-element');
        }
    },

    async submitBooking() {
        const btn = document.getElementById('btnSubmitPayment');
        btn.innerText = "Processing...";
        btn.disabled = true;

        try {
            let paymentMethodId = "pm_card_us"; // Default for helping mode

            // Only use Stripe if rate > 0
            if (this.state.selectedMentor.hourly_rate > 0) {
                 const {paymentMethod, error} = await this.state.stripe.createPaymentMethod({
                    type: 'card',
                    card: this.state.cardElement,
                });
                if (error) {
                    document.getElementById('card-errors').textContent = error.message;
                    throw new Error(error.message);
                }
                paymentMethodId = paymentMethod.id;
            }

            const res = await api.createBookingIntent({
                mentor_id: this.state.selectedMentor.id,
                mentee_id: this.state.currentUser.id,
                datetime_slots: this.state.selectedSlots,
                payment_method_id: paymentMethodId
            });

            if (res.error) throw new Error(res.error);

            alert("Booking Confirmed!");
            this.switchTab('find');

        } catch (e) {
            alert("Booking Error: " + e.message);
        } finally {
            btn.innerText = "AUTHORIZE PAYMENT & BOOK";
            btn.disabled = false;
        }
    },

    // --- Availability, Requests, Helpers ---
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
const storage = { get: (k) => JSON.parse(localStorage.getItem(k)), set: (k, v) => localStorage.setItem(k, JSON.stringify(v)), remove: (k) => localStorage.removeItem(k) };

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
//         userRole: 'learner',
//         hasCar: false,
//         currentStep: 1,
//         totalSteps: 4,
//         scanner: null,
//         stripe: null,
//         cardElement: null
//     },

//     init() {
//         setTimeout(() => document.getElementById('splash').style.transform = 'translateY(-100%)', 1000);
//         const user = storage.get('lynx_user');
//         if (user) this.showDashboard(user);
//         this.initStripe();
//     },

//     // --- STRIPE INIT ---
//     initStripe() {
//         // Use your Stripe Test Public Key here
//         if (window.Stripe) {
//             this.state.stripe = Stripe('pk_test_TYooMQauvdEDq54NiTphI7jx'); // Replace if you have your own
//             const elements = this.state.stripe.elements();
//             this.state.cardElement = elements.create('card', {
//                 style: {
//                     base: {
//                         color: "#ffffff",
//                         fontFamily: '"Inter", sans-serif',
//                         fontSmoothing: "antialiased",
//                         fontSize: "16px",
//                         "::placeholder": { color: "#aab7c4" }
//                     },
//                     invalid: { color: "#fa755a", iconColor: "#fa755a" }
//                 }
//             });
//             // We mount this when the payment view opens, so we check existence
//             // Actually, Stripe Elements needs the DOM to exist. 
//             // We'll mount it inside proceedToPayment to ensure the div is visible.
//         }
//     },

//     // --- Auth & Registration ---
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
//         if (this.state.scanner) {
//             this.state.scanner.clear();
//             this.state.scanner = null;
//         }
//         if (tabId !== 'session' && this.state.sessionPoller) {
//             clearInterval(this.state.sessionPoller);
//             this.state.sessionPoller = null;
//         }
        
//         ui.switchTab(tabId, this.state.currentUser?.role);

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

//     async enterSessionMode(sessionId) {
//         if (!sessionId) return;
//         document.getElementById('tabSession').classList.remove('hidden');
        
//         try {
//             const fresh = await api.getSessionStatus(sessionId);
//             this.state.activeSession = fresh;
//         } catch (e) {
//             this.state.activeSession = { id: sessionId, status: 'scheduled' }; 
//         }
        
//         ui.renderSessionStatus(this.state.activeSession, this.state.currentUser.role);
        
//         if (this.state.sessionPoller) clearInterval(this.state.sessionPoller);
//         this.state.sessionPoller = setInterval(() => this.syncSessionStatus(), 5000);
        
//         this.switchTab('session');
//     },

//     async syncSessionStatus() {
//         if (!this.state.activeSession) return;
//         try {
//             const fresh = await api.getSessionStatus(this.state.activeSession.id);
//             if (fresh.status !== this.state.activeSession.status) {
//                 this.state.activeSession = fresh;
//                 ui.renderSessionStatus(this.state.activeSession, this.state.currentUser.role);
//             }
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

//     // --- CAMERA LOGIC ---
//     startScanner() {
//         document.getElementById('scanContainer').classList.remove('hidden');
//         document.getElementById('btnOpenScanner').classList.add('hidden');

//         if(!document.getElementById('reader')) return alert("Scanner DOM error. Try refreshing.");

//         try {
//             // Re-init scanner if needed
//             if (!this.state.scanner) {
//                 this.state.scanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: 250 });
//             }
//             this.state.scanner.render(
//                 (decodedText) => this.handleScanSuccess(decodedText),
//                 (error) => { /* ignore */ }
//             );
//         } catch (e) {
//             alert("Camera failed. Check permissions.");
//         }
//     },

//     async handleScanSuccess(qrString) {
//         if (this.state.scanner) {
//             this.state.scanner.clear();
//             this.state.scanner = null;
//         }

//         try {
//             const data = await api.scanQR(this.state.currentUser.id, qrString);
//             alert(data.message);
//             if (data.message.includes("Started") || data.message.includes("Active")) {
//                 this.state.activeSession.status = 'active';
//             }
//             if (data.message.includes("Ended")) {
//                 this.state.activeSession.status = 'completed';
//             }
//             ui.renderSessionStatus(this.state.activeSession, this.state.currentUser.role);
//         } catch (e) { alert("Scan Failed: " + e.message); }
//     },

//     async processManualScan() {
//         const token = document.getElementById('scanInput').value;
//         this.handleScanSuccess(token);
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
//         if (this.state.scanner) { 
//             this.state.scanner.clear(); 
//             this.state.scanner = null; 
//         }
//         clearInterval(this.state.sessionPoller);
//         this.state.activeSession = null;
//         document.getElementById('tabSession').classList.add('hidden');
//         this.switchTab('upcoming');
//     },

//     // --- Booking Flow & Stripe ---
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

//         // Mount Stripe Element now that the div is visible
//         if (this.state.cardElement) {
//             this.state.cardElement.mount('#card-element');
//         }
//     },

//     async submitBooking() {
//         const btn = document.getElementById('btnSubmitPayment');
//         btn.innerText = "Processing...";
//         btn.disabled = true;

//         try {
//             // 1. Create Payment Method via Stripe.js
//             const {paymentMethod, error} = await this.state.stripe.createPaymentMethod({
//                 type: 'card',
//                 card: this.state.cardElement,
//             });

//             if (error) {
//                 document.getElementById('card-errors').textContent = error.message;
//                 throw new Error(error.message);
//             }

//             // 2. Send to Backend
//             const res = await api.createBookingIntent({
//                 mentor_id: this.state.selectedMentor.id,
//                 mentee_id: this.state.currentUser.id,
//                 datetime_slots: this.state.selectedSlots,
//                 payment_method_id: paymentMethod.id
//             });

//             // 3. Handle 3DS Action if needed (Manual Capture usually doesn't need immediate action unless triggered)
//             // But we check just in case.
//             if (res.error) {
//                 // If backend returns a Stripe error
//                 throw new Error(res.error);
//             }

//             alert("Payment Authorized! Booking Confirmed.");
//             this.switchTab('find');

//         } catch (e) {
//             alert("Booking Error: " + e.message);
//         } finally {
//             btn.innerText = "AUTHORIZE PAYMENT & BOOK";
//             btn.disabled = false;
//         }
//     },

//     // --- Availability & Requests ---
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

//     // --- Auth Helpers ---
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

//     closeModal() { document.getElementById('authModal').classList.replace('flex', 'hidden'); },
//     closeDateModal() { document.getElementById('dateModal').classList.replace('flex', 'hidden'); },
//     logout() { storage.remove('lynx_user'); window.location.reload(); },
//     goHome() { window.location.reload(); }
// };

// window.onload = () => app.init();
// const storage = { get: (k) => JSON.parse(localStorage.getItem(k)), set: (k, v) => localStorage.setItem(k, JSON.stringify(v)), remove: (k) => localStorage.removeItem(k) };

