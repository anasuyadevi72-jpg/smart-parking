/* =========================================================
   PARKHASH REAL-TIME SMART PARKING OPERATING SYSTEM
   Real-Time IoT Bay Telemetry, Automated Barrier Gates & Cashier
   ========================================================= */

/* ================= CONSTANTS & STORAGE KEYS ================= */
const ACCOUNT_KEY = "parkhash_account";
const CURRENT_USER_KEY = "parkhash_current_user";
const DATA_KEY = "parkhash_realtime_data";
const SETTINGS_KEY = "parkhash_realtime_settings";

/* PARKING LOT DEFINITION: 24 SMART BAYS ACROSS 4 ZONES */
const PARKING_BAYS = [
    // Zone A: Ground Floor / Express (8 bays)
    { code: "A-01", zone: "A", name: "Ground Bay 1", type: "standard" },
    { code: "A-02", zone: "A", name: "Ground Bay 2", type: "standard" },
    { code: "A-03", zone: "A", name: "Ground Bay 3", type: "standard" },
    { code: "A-04", zone: "A", name: "Ground Bay 4", type: "standard" },
    { code: "A-05", zone: "A", name: "Ground Bay 5", type: "standard" },
    { code: "A-06", zone: "A", name: "Ground Bay 6", type: "standard" },
    { code: "A-07", zone: "A", name: "Ground Bay 7", type: "standard" },
    { code: "A-08", zone: "A", name: "Ground Bay 8", type: "standard" },

    // Zone B: Level 1 / Standard (8 bays)
    { code: "B-01", zone: "B", name: "Level 1 Bay 1", type: "standard" },
    { code: "B-02", zone: "B", name: "Level 1 Bay 2", type: "standard" },
    { code: "B-03", zone: "B", name: "Level 1 Bay 3", type: "standard" },
    { code: "B-04", zone: "B", name: "Level 1 Bay 4", type: "standard" },
    { code: "B-05", zone: "B", name: "Level 1 Bay 5", type: "standard" },
    { code: "B-06", zone: "B", name: "Level 1 Bay 6", type: "standard" },
    { code: "B-07", zone: "B", name: "Level 1 Bay 7", type: "standard" },
    { code: "B-08", zone: "B", name: "Level 1 Bay 8", type: "standard" },

    // Zone EV: Fast Charging Hub (4 bays)
    { code: "EV-01", zone: "EV", name: "Fast Charger 1 (150kW)", type: "ev" },
    { code: "EV-02", zone: "EV", name: "Fast Charger 2 (150kW)", type: "ev" },
    { code: "EV-03", zone: "EV", name: "Fast Charger 3 (60kW)", type: "ev" },
    { code: "EV-04", zone: "EV", name: "Fast Charger 4 (60kW)", type: "ev" },

    // Zone VIP: Executive & Valet (4 bays)
    { code: "V-01", zone: "VIP", name: "VIP Executive Bay 1", type: "vip" },
    { code: "V-02", zone: "VIP", name: "VIP Executive Bay 2", type: "vip" },
    { code: "V-03", zone: "VIP", name: "VIP Executive Bay 3", type: "vip" },
    { code: "V-04", zone: "VIP", name: "VIP Executive Bay 4", type: "vip" }
];

/* RANDOM VEHICLE GENERATOR ASSETS */
const SAMPLE_PLATES = [
    "KA01AB1021", "MH12PQ7123", "DL04CA9021", "TN09XY1532",
    "AP28CD4821", "KA05MN2210", "HR26DK4499", "TS07FA8801",
    "KL07BN5678", "UP16AX3344", "GJ01LM6789", "CH01TB9012"
];

const VEHICLE_TYPES = ["sedan", "suv", "ev", "bike"];

/* ================= STATE ================= */
let activeVehicles = [];   // currently parked
let history = [];          // completed sessions
let telemetryLogs = [];    // real-time log messages
let currentUser = null;
let currentZoneFilter = "all";
let currentStatusFilter = "all";
let searchHighlightSlot = null;
let simulationInterval = null;
let isSimulating = true;
let simSpeed = 10000;      // 10s default

let settings = {
    theme: "aurora",
    compact: false,
    notifications: true,
    autoSave: true,
    time24: false,
    sound: true,
    rates: {
        sedan: 40,
        suv: 50,
        ev: 60,
        bike: 20
    }
};

/* ================= DOM HELPER ================= */
const $ = (id) => document.getElementById(id);

/* ================= WEB AUDIO SYNTH (NO EXTERNAL FILES) ================= */
class SoundFx {
    constructor() {
        this.ctx = null;
    }

    init() {
        if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioCtx();
        }
    }

    playChime(type = "in") {
        if (!settings.sound) return;
        try {
            this.init();
            if (!this.ctx) return;
            if (this.ctx.state === "suspended") {
                this.ctx.resume();
            }

            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.connect(gain);
            gain.connect(this.ctx.destination);

            const now = this.ctx.currentTime;
            if (type === "in") {
                // High double ping (Arrival)
                osc.type = "sine";
                osc.frequency.setValueAtTime(587.33, now); // D5
                osc.frequency.exponentialRampToValueAtTime(880, now + 0.12); // A5
                gain.gain.setValueAtTime(0.08, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
                osc.start(now);
                osc.stop(now + 0.36);
            } else {
                // Smooth chord (Departure/Checkout)
                osc.type = "triangle";
                osc.frequency.setValueAtTime(440, now); // A4
                osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.18); // E5
                gain.gain.setValueAtTime(0.09, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
                osc.start(now);
                osc.stop(now + 0.46);
            }
        } catch (_) {}
    }
}
const soundFx = new SoundFx();

/* ================= INITIALIZATION ================= */
document.addEventListener("DOMContentLoaded", () => {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
    }

    loadSettings();
    setupAuth();
    setupNavigation();
    setupMobileApp();
    setupForms();
    setupControls();
    setupModals();
    setupZoneFilters();

    const savedUser = localStorage.getItem(CURRENT_USER_KEY);
    if (savedUser) {
        try {
            currentUser = JSON.parse(savedUser);
            if (currentUser) {
                openApplication();
            }
        } catch {
            localStorage.removeItem(CURRENT_USER_KEY);
        }
    }

    // REAL-TIME 1-SECOND TICKER
    setInterval(realTimeTicker, 1000);

    // START SIMULATION
    startTrafficSimulation();
});

/* ================= REAL-TIME ENGINE TICKER (RUNS EVERY SECOND) ================= */
function realTimeTicker() {
    const now = new Date();

    // 1. Update Real-Time Digital Clocks
    const timeStr = settings.time24
        ? now.toLocaleTimeString("en-IN", { hour12: false })
        : now.toLocaleTimeString("en-IN", { hour12: true });

    if ($("heroLiveClock")) $("heroLiveClock").textContent = timeStr;
    if ($("mobileClock")) $("mobileClock").textContent = timeStr.replace(/:\d\d\s/, " ");

    if (!currentUser) return;

    // 2. Refresh live duration stopwatch badges on all occupied bays
    updateLiveBayTimers();

    // 3. If Search Result is open, update its live duration and accrued bill
    updateLiveSearchResult();
}

/* =========================================================
   AUTH LOGIC
   ========================================================= */
function setupAuth() {
    $("loginTab").addEventListener("click", () => {
        $("loginTab").classList.add("active");
        $("signupTab").classList.remove("active");
        $("loginForm").classList.remove("hidden");
        $("signupForm").classList.add("hidden");
    });

    $("signupTab").addEventListener("click", () => {
        $("signupTab").classList.add("active");
        $("loginTab").classList.remove("active");
        $("signupForm").classList.remove("hidden");
        $("loginForm").classList.add("hidden");
    });

    $("signupForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const name = $("signupName").value.trim();
        const email = $("signupEmail").value.trim().toLowerCase();
        const phone = $("signupPhone").value.trim();
        const password = $("signupPassword").value;
        const confirm = $("signupConfirm").value;
        const message = $("signupMessage");

        if (name.length < 2) {
            showAuthMessage(message, "Please enter your full name.");
            return;
        }
        if (password.length < 6) {
            showAuthMessage(message, "Password must be at least 6 characters.");
            return;
        }
        if (password !== confirm) {
            showAuthMessage(message, "Passwords do not match.");
            return;
        }

        const passwordHash = await hashPassword(password);
        const account = { name, email, phone, passwordHash, createdAt: new Date().toISOString() };
        localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));

        currentUser = { name: account.name, email: account.email, phone: account.phone };
        localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(currentUser));

        initializeData();
        showToast("Account initialized. Welcome to ParkHash!");
        openApplication();
    });

    $("loginForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = $("loginEmail").value.trim().toLowerCase();
        const password = $("loginPassword").value;
        const message = $("loginMessage");

        const account = getAccount();
        if (!account) {
            // Default demo attendant for instant login convenience
            currentUser = { name: "Attendant Alex", email: email || "alex@parkhash.io", phone: "+91 98765 43210" };
            localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(currentUser));
            initializeData();
            showToast("Signed in as Lot Attendant.");
            openApplication();
            return;
        }

        const passwordHash = await hashPassword(password);
        if (account.email !== email || account.passwordHash !== passwordHash) {
            showAuthMessage(message, "Incorrect email or password.");
            return;
        }

        currentUser = { name: account.name, email: account.email, phone: account.phone || "" };
        localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(currentUser));
        initializeData();
        showToast("Welcome back, " + currentUser.name);
        openApplication();
    });

    $("logoutBtn").addEventListener("click", logoutUser);
    if ($("drawerLogoutBtn")) $("drawerLogoutBtn").addEventListener("click", logoutUser);

    // Password visibility toggle
    document.querySelectorAll(".password-toggle").forEach(btn => {
        btn.addEventListener("click", () => {
            const target = $(btn.dataset.target);
            if (target.type === "password") {
                target.type = "text";
                btn.textContent = "Hide";
            } else {
                target.type = "password";
                btn.textContent = "Show";
            }
        });
    });
}

function logoutUser() {
    currentUser = null;
    localStorage.removeItem(CURRENT_USER_KEY);
    $("app").classList.add("hidden");
    $("authScreen").classList.remove("hidden");
    $("loginForm").reset();
    showAuthMessage($("loginMessage"), "");
    closeMobileDrawer();
}

function getAccount() {
    try {
        return JSON.parse(localStorage.getItem(ACCOUNT_KEY));
    } catch {
        return null;
    }
}

async function hashPassword(pwd) {
    if (window.crypto && window.crypto.subtle && window.TextEncoder) {
        const data = new TextEncoder().encode(pwd);
        const hashBuf = await crypto.subtle.digest("SHA-256", data);
        return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, "0")).join("");
    }
    return btoa(unescape(encodeURIComponent(pwd)));
}

function showAuthMessage(element, msg) {
    if (element) element.textContent = msg;
}

function openApplication() {
    $("authScreen").classList.add("hidden");
    $("app").classList.remove("hidden");
    initializeData();
    updateProfileUI();
    applySettings();
    navigateTo("dashboard");
}

/* =========================================================
   DATA PERSISTENCE & INITIALIZATION
   ========================================================= */
function initializeData() {
    const saved = loadData();
    if (saved) {
        activeVehicles = saved.activeVehicles || [];
        history = saved.history || [];
        telemetryLogs = saved.telemetryLogs || [];
    } else {
        // Seed initial realistic vehicles
        seedInitialLot();
    }

    renderAll();
}

function seedInitialLot() {
    activeVehicles = [
        {
            id: "seed_1",
            vehicle: "KA01AB1021",
            type: "sedan",
            driverName: "Vikram Sen",
            driverPhone: "+91 98450 11223",
            slot: "A-01",
            entryTime: new Date(Date.now() - 48 * 60 * 1000).toISOString(), // 48m ago
            exitTime: null,
            feeCharged: 0,
            paymentMethod: "FASTag / RFID",
            paymentStatus: "ACTIVE"
        },
        {
            id: "seed_2",
            vehicle: "MH12PQ7123",
            type: "suv",
            driverName: "Pooja Hegde",
            driverPhone: "+91 97112 33445",
            slot: "A-04",
            entryTime: new Date(Date.now() - 25 * 60 * 1000).toISOString(), // 25m ago
            exitTime: null,
            feeCharged: 0,
            paymentMethod: "UPI / QR Code",
            paymentStatus: "ACTIVE"
        },
        {
            id: "seed_3",
            vehicle: "DL04CA9021",
            type: "ev",
            driverName: "Rahul Sharma",
            driverPhone: "+91 99880 55667",
            slot: "EV-01",
            entryTime: new Date(Date.now() - 85 * 60 * 1000).toISOString(), // 1h 25m ago
            exitTime: null,
            feeCharged: 0,
            paymentMethod: "FASTag / RFID",
            paymentStatus: "ACTIVE"
        },
        {
            id: "seed_4",
            vehicle: "TN09XY1532",
            type: "sedan",
            driverName: "Ananya Roy",
            driverPhone: "+91 98221 77889",
            slot: "B-02",
            entryTime: new Date(Date.now() - 12 * 60 * 1000).toISOString(), // 12m ago
            exitTime: null,
            feeCharged: 0,
            paymentMethod: "Credit / Debit Card",
            paymentStatus: "ACTIVE"
        }
    ];

    history = [
        {
            id: "hist_1",
            vehicle: "HR26DK4499",
            type: "suv",
            driverName: "Amit Kumar",
            slot: "A-03",
            entryTime: new Date(Date.now() - 180 * 60 * 1000).toISOString(),
            exitTime: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
            feeCharged: 100,
            paymentMethod: "FASTag / RFID",
            paymentStatus: "PAID"
        },
        {
            id: "hist_2",
            vehicle: "TS07FA8801",
            type: "bike",
            driverName: "Kiran R",
            slot: "B-05",
            entryTime: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
            exitTime: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
            feeCharged: 30,
            paymentMethod: "UPI / QR Code",
            paymentStatus: "PAID"
        }
    ];

    addTelemetryLog("IN", "KA01AB1021 checked into Bay A-01 (Express)");
    addTelemetryLog("IN", "DL04CA9021 plugged into Hypercharger EV-01");
    addTelemetryLog("OUT", "HR26DK4499 paid ₹100 via FASTag and cleared Exit Gate 2");
    saveData();
}

function loadData() {
    try {
        const raw = localStorage.getItem(DATA_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function saveData() {
    if (!settings.autoSave) return;
    try {
        localStorage.setItem(DATA_KEY, JSON.stringify({
            activeVehicles,
            history,
            telemetryLogs: telemetryLogs.slice(0, 50)
        }));
    } catch (_) {}
}

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY));
        if (saved) {
            settings = { ...settings, ...saved, rates: { ...settings.rates, ...(saved.rates || {}) } };
        }
    } catch (_) {}
}

function saveSettings() {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (_) {}
}

function applySettings() {
    document.body.dataset.theme = settings.theme || "aurora";
    document.body.classList.toggle("compact-mode", !!settings.compact);

    if ($("themeSelect")) $("themeSelect").value = settings.theme;
    if ($("compactToggle")) $("compactToggle").checked = !!settings.compact;
    if ($("notificationToggle")) $("notificationToggle").checked = !!settings.notifications;
    if ($("autoSaveToggle")) $("autoSaveToggle").checked = !!settings.autoSave;
    if ($("timeToggle")) $("timeToggle").checked = !!settings.time24;
    if ($("soundToggle")) $("soundToggle").checked = !!settings.sound;

    if ($("rateSedanInput")) $("rateSedanInput").value = settings.rates.sedan || 40;
    if ($("rateSuvInput")) $("rateSuvInput").value = settings.rates.suv || 50;
    if ($("rateEvInput")) $("rateEvInput").value = settings.rates.ev || 60;
    if ($("rateBikeInput")) $("rateBikeInput").value = settings.rates.bike || 20;
}

/* =========================================================
   REAL-TIME SMART PARKING ALLOCATION & PRICING
   ========================================================= */

function normalizeVehicle(plate) {
    if (!plate) return "";
    return plate.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function getHourlyRate(type = "sedan") {
    return settings.rates[type] || settings.rates.sedan || 40;
}

function calculateParkingFee(entryTime, exitTime = null, vehicleType = "sedan") {
    const start = new Date(entryTime).getTime();
    const end = exitTime ? new Date(exitTime).getTime() : Date.now();
    const durationMs = Math.max(end - start, 0);
    const durationHours = durationMs / (1000 * 60 * 60);

    const hourlyRate = getHourlyRate(vehicleType);

    // First 15 minutes grace: nominal or free, then minimum 1 hour charge
    if (durationHours <= 0.25) {
        return Math.round(hourlyRate * 0.5); // ₹20 minimum grace charge
    }

    const billableHours = Math.max(Math.ceil(durationHours), 1);
    return billableHours * hourlyRate;
}

function findBestAvailableBay(preferredZone = "auto", vehicleType = "sedan") {
    const occupiedBayCodes = new Set(activeVehicles.map(v => v.slot));

    // 1. If EV vehicle, strongly prioritize EV charging bay
    if (vehicleType === "ev") {
        const evBay = PARKING_BAYS.find(b => b.zone === "EV" && !occupiedBayCodes.has(b.code));
        if (evBay) return evBay;
    }

    // 2. If specific zone requested and available
    if (preferredZone !== "auto") {
        const zoneBay = PARKING_BAYS.find(b => b.zone === preferredZone && !occupiedBayCodes.has(b.code));
        if (zoneBay) return zoneBay;
    }

    // 3. Otherwise find first available bay in order: A -> B -> VIP -> EV
    return PARKING_BAYS.find(b => !occupiedBayCodes.has(b.code)) || null;
}

/* PARK A VEHICLE */
function parkVehicle(plateInput, type = "sedan", zonePref = "auto", driverName = "", driverPhone = "") {
    const plate = normalizeVehicle(plateInput);
    if (!plate || plate.length < 4) {
        showToast("Please enter a valid registration plate.");
        return false;
    }

    if (activeVehicles.some(v => v.vehicle === plate)) {
        showToast(`Vehicle ${plate} is already parked inside.`);
        return false;
    }

    const bay = findBestAvailableBay(zonePref, type);
    if (!bay) {
        showToast("Lot Full! All 24 parking bays are currently occupied.");
        return false;
    }

    const newSession = {
        id: "v_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        vehicle: plate,
        type,
        driverName: driverName.trim(),
        driverPhone: driverPhone.trim(),
        slot: bay.code,
        entryTime: new Date().toISOString(),
        exitTime: null,
        feeCharged: 0,
        paymentMethod: "FASTag / RFID",
        paymentStatus: "ACTIVE"
    };

    activeVehicles.push(newSession);
    saveData();
    renderAll();

    // Sound and pulse gate barrier
    soundFx.playChime("in");
    pulseGateBarrier(1, "OPEN • PROCESSING ENTRY");

    const vehicleIcon = getVehicleIcon(type);
    addTelemetryLog("IN", `${vehicleIcon} ${plate} allocated Bay ${bay.code} (${bay.name})`);

    // Show digital pass modal
    showDigitalPassModal(newSession, bay);
    showToast(`Vehicle ${plate} assigned to Bay ${bay.code}!`);
    return true;
}

/* EXIT / CHECKOUT A VEHICLE */
function exitVehicle(plateInput, paymentMethod = "UPI / QR Code") {
    const plate = normalizeVehicle(plateInput);
    const index = activeVehicles.findIndex(v => v.vehicle === plate);

    if (index === -1) {
        showToast(`Vehicle ${plate} is not currently parked.`);
        return false;
    }

    const record = activeVehicles[index];
    const exitTime = new Date().toISOString();
    const fee = calculateParkingFee(record.entryTime, exitTime, record.type);

    record.exitTime = exitTime;
    record.feeCharged = fee;
    record.paymentMethod = paymentMethod;
    record.paymentStatus = "PAID";

    // Move to history
    history.unshift({ ...record });
    activeVehicles.splice(index, 1);

    saveData();
    renderAll();

    // Sound & Barrier Gate 2
    soundFx.playChime("out");
    pulseGateBarrier(2, "OPEN • RELEASING BARRIER");

    const durationStr = formatDuration(record.entryTime, record.exitTime);
    addTelemetryLog("OUT", `${record.vehicle} cleared Gate 2 • Paid ₹${fee} via ${paymentMethod} (${durationStr})`);

    // Show receipt modal
    showReceiptModal(record);
    showToast(`${plate} cleared exit! Paid ₹${fee}.`);
    return true;
}

/* =========================================================
   GATE BARRIER PULSE ANIMATION
   ========================================================= */
function pulseGateBarrier(gateNumber, text) {
    const heroId = gateNumber === 1 ? "gate1HeroStatus" : "gate2HeroStatus";
    const telemetryStateId = gateNumber === 1 ? "gate1StateText" : "gate2StateText";
    const signalId = gateNumber === 1 ? "gate1Signal" : "gate2Signal";

    const heroEl = $(heroId);
    const stateEl = $(telemetryStateId);
    const signalEl = $(signalId);

    if (heroEl) {
        heroEl.textContent = text;
        heroEl.style.color = "var(--cyan)";
    }
    if (stateEl) {
        stateEl.textContent = text;
        stateEl.style.color = "var(--cyan)";
    }
    if (signalEl) {
        signalEl.className = "gate-signal green";
        signalEl.style.transform = "scale(1.4)";
    }

    setTimeout(() => {
        if (heroEl) {
            heroEl.textContent = "BARRIER IDLE";
            heroEl.style.color = gateNumber === 1 ? "var(--green)" : "var(--blue)";
        }
        if (stateEl) {
            stateEl.textContent = "BARRIER DOWN (READY)";
            stateEl.style.color = "var(--green)";
        }
        if (signalEl) {
            signalEl.style.transform = "scale(1)";
        }
    }, 2800);
}

/* =========================================================
   LIVE TRAFFIC SIMULATION ENGINE
   ========================================================= */
function startTrafficSimulation() {
    stopTrafficSimulation();
    if (!isSimulating) return;

    simulationInterval = setInterval(() => {
        if (!currentUser) return;

        const isLotFull = activeVehicles.length >= PARKING_BAYS.length;
        const hasCars = activeVehicles.length > 0;

        // 60% Arrival, 40% Departure
        const roll = Math.random();

        if ((roll < 0.60 && !isLotFull) || (!hasCars && !isLotFull)) {
            // Simulated Arrival
            const randomPlate = SAMPLE_PLATES[Math.floor(Math.random() * SAMPLE_PLATES.length)]
                + (Math.floor(Math.random() * 89) + 10);
            const randomType = VEHICLE_TYPES[Math.floor(Math.random() * VEHICLE_TYPES.length)];

            if (!activeVehicles.some(v => v.vehicle === randomPlate)) {
                const bay = findBestAvailableBay("auto", randomType);
                if (bay) {
                    const newSession = {
                        id: "sim_" + Date.now().toString(36),
                        vehicle: randomPlate,
                        type: randomType,
                        driverName: "Guest Driver",
                        driverPhone: "",
                        slot: bay.code,
                        entryTime: new Date().toISOString(),
                        exitTime: null,
                        feeCharged: 0,
                        paymentMethod: "FASTag / RFID",
                        paymentStatus: "ACTIVE"
                    };
                    activeVehicles.push(newSession);
                    saveData();
                    renderAll();
                    pulseGateBarrier(1, `IN: ${randomPlate} -> ${bay.code}`);
                    soundFx.playChime("in");
                    addTelemetryLog("IN", `${getVehicleIcon(randomType)} Auto-in: ${randomPlate} to Bay ${bay.code}`);
                }
            }
        } else if (hasCars) {
            // Simulated Departure
            const randomIndex = Math.floor(Math.random() * activeVehicles.length);
            const car = activeVehicles[randomIndex];
            const exitTime = new Date().toISOString();
            const fee = calculateParkingFee(car.entryTime, exitTime, car.type);

            car.exitTime = exitTime;
            car.feeCharged = fee;
            car.paymentMethod = "FASTag / RFID";
            car.paymentStatus = "PAID";

            history.unshift({ ...car });
            activeVehicles.splice(randomIndex, 1);
            saveData();
            renderAll();

            pulseGateBarrier(2, `OUT: ${car.vehicle} (₹${fee})`);
            soundFx.playChime("out");
            addTelemetryLog("OUT", `Auto-out: ${car.vehicle} paid ₹${fee} from Bay ${car.slot}`);
        }
    }, simSpeed);

    updateSimUI();
}

function stopTrafficSimulation() {
    if (simulationInterval) {
        clearInterval(simulationInterval);
        simulationInterval = null;
    }
    updateSimUI();
}

function toggleTrafficSimulation() {
    isSimulating = !isSimulating;
    if (isSimulating) {
        startTrafficSimulation();
        showToast("Live Traffic Simulator: ACTIVATED");
    } else {
        stopTrafficSimulation();
        showToast("Live Traffic Simulator: PAUSED");
    }
    updateSimUI();
}

function updateSimUI() {
    const btn = $("toggleSimBtn");
    const label = $("simBtnLabel");
    const analyticsBtn = $("analyticsToggleSim");

    if (btn && label) {
        if (isSimulating) {
            btn.classList.add("active");
            label.textContent = "Live Traffic: ON";
        } else {
            btn.classList.remove("active");
            label.textContent = "Live Traffic: PAUSED";
        }
    }
    if (analyticsBtn) {
        analyticsBtn.textContent = isSimulating ? "Pause Live Traffic Simulator" : "Resume Live Traffic Simulator";
        analyticsBtn.className = isSimulating ? "danger-outline-btn full-btn" : "primary-btn full-btn";
    }
}

/* =========================================================
   UI RENDERING (SLOTS, STATS, TELEMETRY, LOGS)
   ========================================================= */

function renderAll() {
    renderParkingGrids();
    updateDashboardStats();
    renderHistoryTable();
    renderTelemetryLogStreams();
    updateProfileUI();
}

/* RENDER BOTH DASHBOARD GRID & LARGE FLOOR PLAN GRID */
function renderParkingGrids() {
    renderGridContainer($("dashboardParkingGrid"), true);
    renderGridContainer($("mainParkingGrid"), false);
}

function renderGridContainer(container, isDashboardPreview = false) {
    if (!container) return;
    container.innerHTML = "";

    const occupiedMap = new Map();
    activeVehicles.forEach(v => occupiedMap.set(v.slot, v));

    // Filter bays according to zone and status (for full lot view)
    let filteredBays = PARKING_BAYS;
    if (!isDashboardPreview) {
        if (currentZoneFilter !== "all") {
            filteredBays = filteredBays.filter(b => b.zone === currentZoneFilter);
        }
        if (currentStatusFilter === "available") {
            filteredBays = filteredBays.filter(b => !occupiedMap.has(b.code));
        } else if (currentStatusFilter === "occupied") {
            filteredBays = filteredBays.filter(b => occupiedMap.has(b.code));
        }
    } else {
        // Show all 24 or clean preview
        filteredBays = PARKING_BAYS;
    }

    filteredBays.forEach(bay => {
        const slotEl = document.createElement("div");
        slotEl.className = "parking-slot";
        slotEl.dataset.bay = bay.code;

        if (bay.type === "ev") slotEl.classList.add("ev-slot");
        if (bay.type === "vip") slotEl.classList.add("vip-slot");

        const vehicle = occupiedMap.get(bay.code);
        const isOccupied = !!vehicle;

        if (isOccupied) {
            slotEl.classList.add("occupied");
        } else {
            slotEl.classList.add("available");
        }

        if (searchHighlightSlot === bay.code) {
            slotEl.classList.add("search-highlight");
        }

        const ledClass = isOccupied ? (bay.type === "ev" ? "bay-led ev" : "bay-led occupied") : "bay-led vacant";
        const icon = isOccupied ? getVehicleIcon(vehicle.type) : (bay.type === "ev" ? "⚡" : "P");

        slotEl.innerHTML = `
            <div class="slot-top-row">
                <span class="slot-code">${bay.code}</span>
                <span class="${ledClass}"></span>
            </div>
            <div class="slot-car-icon">${icon}</div>
            ${isOccupied ? `
                <div class="plate-badge" title="${vehicle.vehicle}">${vehicle.vehicle}</div>
                <div class="slot-live-timer" data-timer-entry="${vehicle.entryTime}">
                    ${formatDuration(vehicle.entryTime)}
                </div>
            ` : `
                <div class="slot-empty-label">VACANT</div>
            `}
        `;

        slotEl.addEventListener("click", () => {
            openSlotDetailModal(bay, vehicle);
        });

        container.appendChild(slotEl);
    });
}

function updateLiveBayTimers() {
    document.querySelectorAll("[data-timer-entry]").forEach(timerEl => {
        const entry = timerEl.dataset.timerEntry;
        if (entry) {
            timerEl.textContent = formatDuration(entry);
        }
    });
}

function getVehicleIcon(type = "sedan") {
    switch (type) {
        case "suv": return "🚙";
        case "ev": return "⚡";
        case "bike": return "🏍️";
        case "sedan":
        default: return "🚗";
    }
}

/* DASHBOARD METRICS & CAPACITY GAUGE */
function updateDashboardStats() {
    const total = PARKING_BAYS.length;
    const occupied = activeVehicles.length;
    const available = Math.max(total - occupied, 0);
    const occupancyPercent = Math.round((occupied / total) * 100);

    if ($("totalSlots")) $("totalSlots").textContent = total;
    if ($("occupiedSlots")) $("occupiedSlots").textContent = occupied;
    if ($("availableSlots")) $("availableSlots").textContent = available;
    if ($("parkingCapacity")) $("parkingCapacity").textContent = `${occupied} / ${total}`;

    if ($("heroOccupancyPercent")) $("heroOccupancyPercent").textContent = `${occupancyPercent}%`;

    // Calculate Today's Total Collections
    const totalRev = history.reduce((sum, h) => sum + (h.feeCharged || 0), 0);
    if ($("todayRevenue")) $("todayRevenue").textContent = `₹${totalRev.toLocaleString()}`;
    if ($("historyRevenue")) $("historyRevenue").textContent = `₹${totalRev.toLocaleString()}`;

    // EV Chargers Status
    const evOccupied = activeVehicles.filter(v => v.slot && v.slot.startsWith("EV")).length;
    const evAvailable = 4 - evOccupied;
    if ($("evChargerHeroStatus")) $("evChargerHeroStatus").textContent = `${evAvailable} / 4 READY`;
}

/* SEARCH LOCATOR */
function performSearch(queryInput) {
    const query = normalizeVehicle(queryInput);
    if (!query) {
        showToast("Enter a registration plate or bay number.");
        return;
    }

    // Match plate or bay code
    const match = activeVehicles.find(v => v.vehicle === query || v.vehicle.includes(query) || v.slot === query);

    if (!match) {
        searchHighlightSlot = null;
        renderParkingGrids();
        if ($("searchResult")) $("searchResult").classList.add("hidden");
        showToast(`Vehicle or Bay "${query}" is not currently in the parking lot.`);
        return;
    }

    searchHighlightSlot = match.slot;
    renderParkingGrids();

    // Scroll to highlighted slot
    setTimeout(() => {
        const highlightedEl = document.querySelector(`.parking-slot[data-bay="${match.slot}"]`);
        if (highlightedEl) {
            highlightedEl.scrollIntoView({ behavior: "smooth", block: "center" });
        }
    }, 150);

    // Populate search result box
    const resultBox = $("searchResult");
    if (resultBox) {
        resultBox.classList.remove("hidden");
        if ($("resultVehicle")) $("resultVehicle").textContent = match.vehicle;
        if ($("resultSlot")) $("resultSlot").textContent = match.slot;
        if ($("resultType")) $("resultType").textContent = formatTypeLabel(match.type);
        if ($("resultEntry")) $("resultEntry").textContent = formatDateTime(match.entryTime);
        if ($("resultDuration")) $("resultDuration").textContent = formatDuration(match.entryTime);
        if ($("resultFee")) $("resultFee").textContent = `₹${calculateParkingFee(match.entryTime, null, match.type)}`;

        const exitBtn = $("resultExitBtn");
        if (exitBtn) {
            exitBtn.onclick = () => {
                exitVehicle(match.vehicle);
                resultBox.classList.add("hidden");
            };
        }
    }

    showToast(`Found ${match.vehicle} in Bay ${match.slot}!`);
}

function updateLiveSearchResult() {
    const resultBox = $("searchResult");
    if (!resultBox || resultBox.classList.contains("hidden")) return;

    const plate = $("resultVehicle") ? $("resultVehicle").textContent : null;
    if (!plate) return;

    const vehicle = activeVehicles.find(v => v.vehicle === plate);
    if (vehicle) {
        if ($("resultDuration")) $("resultDuration").textContent = formatDuration(vehicle.entryTime);
        if ($("resultFee")) $("resultFee").textContent = `₹${calculateParkingFee(vehicle.entryTime, null, vehicle.type)}`;
    }
}

/* =========================================================
   PARKING LOG & BILLING TABLE
   ========================================================= */
function renderHistoryTable() {
    const tbody = $("historyTableBody");
    if (!tbody) return;
    tbody.innerHTML = "";

    const combined = [
        ...activeVehicles.map(v => ({ ...v, active: true })),
        ...history.map(h => ({ ...h, active: false }))
    ];

    if ($("historyTotal")) $("historyTotal").textContent = combined.length;
    if ($("historyActive")) $("historyActive").textContent = activeVehicles.length;
    if ($("historyCompleted")) $("historyCompleted").textContent = history.length;

    if (combined.length === 0) {
        if ($("emptyHistory")) $("emptyHistory").classList.remove("hidden");
        return;
    }
    if ($("emptyHistory")) $("emptyHistory").classList.add("hidden");

    combined.forEach((rec, idx) => {
        const row = document.createElement("tr");
        const statusBadge = rec.active
            ? `<span class="status-badge active">IN LOT</span>`
            : `<span class="status-badge completed">SETTLED</span>`;

        const feeDisplay = rec.active
            ? `<span style="color: var(--cyan);">₹${calculateParkingFee(rec.entryTime, null, rec.type)} (est.)</span>`
            : `<span style="color: var(--green); font-weight: 700;">₹${rec.feeCharged}</span>`;

        row.innerHTML = `
            <td>${idx + 1}</td>
            <td class="vehicle-cell">${getVehicleIcon(rec.type)} ${rec.vehicle}</td>
            <td>${formatTypeLabel(rec.type)}</td>
            <td><strong>${rec.slot || "—"}</strong></td>
            <td>${formatDateTime(rec.entryTime)}</td>
            <td>${rec.exitTime ? formatDateTime(rec.exitTime) : "Currently Parked"}</td>
            <td>${formatDuration(rec.entryTime, rec.exitTime)}</td>
            <td>${feeDisplay}</td>
            <td>${statusBadge}</td>
            <td>
                <button class="pill-btn" onclick="openSessionReceipt('${rec.id}')">Receipt</button>
            </td>
        `;

        tbody.appendChild(row);
    });
}

function openSessionReceipt(sessionId) {
    const session = history.find(h => h.id === sessionId) || activeVehicles.find(v => v.id === sessionId);
    if (session) {
        showReceiptModal(session);
    }
}

/* =========================================================
   TELEMETRY LOG STREAM
   ========================================================= */
function addTelemetryLog(direction = "IN", text = "") {
    const timeStr = new Date().toLocaleTimeString("en-IN", { hour12: false });
    const logItem = { time: timeStr, dir: direction, text };
    telemetryLogs.unshift(logItem);
    if (telemetryLogs.length > 80) telemetryLogs.pop();

    renderTelemetryLogStreams();
}

function renderTelemetryLogStreams() {
    // 1. Dashboard Mini Live Stream
    const miniStream = $("dashboardLiveStream");
    if (miniStream) {
        if (telemetryLogs.length === 0) {
            miniStream.innerHTML = `<div class="stream-item empty-stream">Sensors running. Live check-in/out updates will appear here.</div>`;
        } else {
            miniStream.innerHTML = telemetryLogs.slice(0, 4).map(l => `
                <div class="stream-item">
                    <span class="stream-badge ${l.dir === 'IN' ? 'in' : 'out'}">${l.dir}</span>
                    <span style="font-size: 11px; flex-grow: 1;">${l.text}</span>
                    <small style="color: var(--text-muted); font-size: 9px;">${l.time}</small>
                </div>
            `).join("");
        }
    }

    // 2. Full Telemetry Stream (Telemetry page)
    const fullStream = $("fullTelemetryStream");
    if (fullStream) {
        if (telemetryLogs.length === 0) {
            fullStream.innerHTML = `<div style="color: var(--text-muted); padding: 10px;">Telemetry feed connected. Waiting for bay optical events...</div>`;
        } else {
            fullStream.innerHTML = telemetryLogs.map(l => `
                <div class="log-entry">
                    <span class="log-time">[${l.time}]</span>
                    <span class="log-badge ${l.dir === 'IN' ? 'in' : 'out'}">${l.dir}</span>
                    <span>${l.text}</span>
                </div>
            `).join("");
        }
    }
}

/* =========================================================
   MODALS: SLOT INSPECTOR, DIGITAL PASS, RECEIPT
   ========================================================= */

/* 1. SLOT INSPECTOR MODAL */
function openSlotDetailModal(bay, vehicle) {
    const modal = $("slotModal");
    const title = $("slotModalTitle");
    const content = $("slotModalContent");
    if (!modal || !content) return;

    title.textContent = `Bay ${bay.code} • ${bay.name}`;

    if (vehicle) {
        const currentFee = calculateParkingFee(vehicle.entryTime, null, vehicle.type);
        content.innerHTML = `
            <div class="slot-detail-row">
                <span>Current Status</span>
                <strong style="color: var(--red);">● OCCUPIED</strong>
            </div>
            <div class="slot-detail-row">
                <span>Vehicle Registration</span>
                <strong style="color: var(--cyan);">${getVehicleIcon(vehicle.type)} ${vehicle.vehicle}</strong>
            </div>
            <div class="slot-detail-row">
                <span>Vehicle Category</span>
                <strong>${formatTypeLabel(vehicle.type)} (₹${getHourlyRate(vehicle.type)}/hr)</strong>
            </div>
            <div class="slot-detail-row">
                <span>Entry Timestamp</span>
                <strong>${formatDateTime(vehicle.entryTime)}</strong>
            </div>
            <div class="slot-detail-row">
                <span>Elapsed Duration</span>
                <strong style="color: var(--amber);">${formatDuration(vehicle.entryTime)}</strong>
            </div>
            <div class="slot-detail-row">
                <span>Accrued Parking Charge</span>
                <strong style="color: var(--green); font-size: 16px;">₹${currentFee}</strong>
            </div>
            ${vehicle.driverName ? `
                <div class="slot-detail-row">
                    <span>Driver Name</span>
                    <strong>${vehicle.driverName}</strong>
                </div>
            ` : ""}
            <div style="display: flex; gap: 10px; margin-top: 20px;">
                <button id="modalExitActionBtn" class="danger-btn full-btn">Process Exit & Settle Bill →</button>
            </div>
        `;

        const exitBtn = $("modalExitActionBtn");
        if (exitBtn) {
            exitBtn.addEventListener("click", () => {
                closeSlotModal();
                exitVehicle(vehicle.vehicle);
            });
        }
    } else {
        content.innerHTML = `
            <div class="slot-detail-row">
                <span>Current Status</span>
                <strong style="color: var(--green);">✓ VACANT & READY</strong>
            </div>
            <div class="slot-detail-row">
                <span>Zone Assignment</span>
                <strong>Zone ${bay.zone} (${bay.type.toUpperCase()})</strong>
            </div>
            <div class="slot-detail-row">
                <span>Base Tariff</span>
                <strong>₹40 - ₹60 / hour</strong>
            </div>
            <div style="margin-top: 18px; padding: 12px; background: rgba(255,255,255,0.03); border-radius: 10px; border: 1px solid var(--border);">
                <label style="font-size: 11px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase;">Quick Check-In Here</label>
                <div style="display: flex; gap: 8px; margin-top: 6px;">
                    <input id="modalQuickPlateInput" type="text" placeholder="KA01AB1021" uppercase style="padding: 8px 12px; font-size: 13px;">
                    <button id="modalQuickParkBtn" class="primary-btn" style="padding: 8px 14px;">Park</button>
                </div>
            </div>
        `;

        const quickParkBtn = $("modalQuickParkBtn");
        if (quickParkBtn) {
            quickParkBtn.addEventListener("click", () => {
                const plate = $("modalQuickPlateInput").value;
                if (parkVehicle(plate, "sedan", bay.zone)) {
                    closeSlotModal();
                }
            });
        }
    }

    modal.classList.remove("hidden");
}

function closeSlotModal() {
    const modal = $("slotModal");
    if (modal) modal.classList.add("hidden");
}

/* 2. DIGITAL PARKING PASS MODAL */
function showDigitalPassModal(session, bay) {
    const modal = $("passModal");
    const content = $("passModalContent");
    if (!modal || !content) return;

    content.innerHTML = `
        <div class="pass-ticket-body">
            <div class="pass-bay-display">
                <small>ALLOCATED BAY</small>
                <h1>${bay.code}</h1>
                <span>Zone ${bay.zone} • ${bay.name}</span>
            </div>

            <div class="slot-detail-row">
                <span>Vehicle Plate</span>
                <strong style="color: var(--cyan); font-size: 15px;">${getVehicleIcon(session.type)} ${session.vehicle}</strong>
            </div>
            <div class="slot-detail-row">
                <span>Category</span>
                <strong>${formatTypeLabel(session.type)}</strong>
            </div>
            <div class="slot-detail-row">
                <span>Check-In Time</span>
                <strong>${formatDateTime(session.entryTime)}</strong>
            </div>
            <div class="slot-detail-row">
                <span>Hourly Tariff</span>
                <strong>₹${getHourlyRate(session.type)}/hr</strong>
            </div>

            <div class="pass-barcode"></div>
            <p style="text-align: center; font-size: 10px; color: var(--text-muted); font-family: var(--font-mono);">
                TICKET #${session.id.toUpperCase()} • RETAIN FOR EXIT GATE
            </p>
        </div>
    `;

    modal.classList.remove("hidden");
}

/* 3. TAX INVOICE & RECEIPT MODAL */
function showReceiptModal(record) {
    const modal = $("receiptModal");
    const content = $("receiptModalContent");
    if (!modal || !content) return;

    const fee = record.feeCharged || calculateParkingFee(record.entryTime, record.exitTime, record.type);
    const duration = formatDuration(record.entryTime, record.exitTime);

    content.innerHTML = `
        <div class="pass-ticket-body">
            <div class="pass-bay-display" style="background: rgba(16, 185, 129, 0.08); border-color: rgba(16, 185, 129, 0.3);">
                <small style="color: var(--green);">SETTLED & CLEARED</small>
                <h1 style="color: var(--green);">₹${fee}</h1>
                <span style="color: var(--text-secondary);">Paid via ${record.paymentMethod || "FASTag"}</span>
            </div>

            <div class="slot-detail-row">
                <span>Vehicle Plate</span>
                <strong style="color: var(--cyan);">${getVehicleIcon(record.type)} ${record.vehicle}</strong>
            </div>
            <div class="slot-detail-row">
                <span>Assigned Bay</span>
                <strong>${record.slot}</strong>
            </div>
            <div class="slot-detail-row">
                <span>Entry Time</span>
                <strong>${formatDateTime(record.entryTime)}</strong>
            </div>
            <div class="slot-detail-row">
                <span>Exit Time</span>
                <strong>${formatDateTime(record.exitTime || new Date().toISOString())}</strong>
            </div>
            <div class="slot-detail-row">
                <span>Total Stay</span>
                <strong style="color: var(--amber);">${duration}</strong>
            </div>
            <div class="slot-detail-row">
                <span>Base Tariff Rate</span>
                <strong>₹${getHourlyRate(record.type)}/hr</strong>
            </div>

            <div class="pass-barcode"></div>
            <p style="text-align: center; font-size: 10px; color: var(--text-muted); font-family: var(--font-mono);">
                TRANSACTION ID: ${record.id.toUpperCase()} • GSTIN: 29AABCU9603R1ZM
            </p>
        </div>
    `;

    modal.classList.remove("hidden");
}

/* SETUP MODAL BUTTONS */
let confirmAction = null;
function setupModals() {
    if ($("slotModalClose")) $("slotModalClose").addEventListener("click", closeSlotModal);

    if ($("passModalClose")) $("passModalClose").addEventListener("click", () => $("passModal").classList.add("hidden"));
    if ($("passModalPrint")) $("passModalPrint").addEventListener("click", () => {
        window.print();
        $("passModal").classList.add("hidden");
    });

    if ($("receiptModalClose")) $("receiptModalClose").addEventListener("click", () => $("receiptModal").classList.add("hidden"));
    if ($("receiptModalPrint")) $("receiptModalPrint").addEventListener("click", () => {
        window.print();
        $("receiptModal").classList.add("hidden");
    });

    if ($("modalCancel")) $("modalCancel").addEventListener("click", () => $("confirmModal").classList.add("hidden"));
    if ($("modalConfirm")) $("modalConfirm").addEventListener("click", () => {
        if (confirmAction) confirmAction();
        $("confirmModal").classList.add("hidden");
        confirmAction = null;
    });
}

function openConfirmModal(title, msg, onConfirm) {
    if ($("modalTitle")) $("modalTitle").textContent = title;
    if ($("modalMessage")) $("modalMessage").textContent = msg;
    confirmAction = onConfirm;
    if ($("confirmModal")) $("confirmModal").classList.remove("hidden");
}

/* =========================================================
   FORMS & CONTROLS BINDING
   ========================================================= */
function setupForms() {
    // 1. Quick Park Form (Dashboard)
    if ($("quickParkForm")) {
        $("quickParkForm").addEventListener("submit", (e) => {
            e.preventDefault();
            const input = $("quickVehicle");
            const type = $("quickVehicleType") ? $("quickVehicleType").value : "sedan";
            const zone = $("quickZoneSelect") ? $("quickZoneSelect").value : "auto";
            if (parkVehicle(input.value, type, zone)) {
                input.value = "";
            }
        });
    }

    // Quick Sample Plate Fill Button
    if ($("quickSampleBtn")) {
        $("quickSampleBtn").addEventListener("click", () => {
            const randomPlate = SAMPLE_PLATES[Math.floor(Math.random() * SAMPLE_PLATES.length)]
                + (Math.floor(Math.random() * 89) + 10);
            if ($("quickVehicle")) $("quickVehicle").value = randomPlate;
        });
    }

    // 2. Operations Park Form
    if ($("parkForm")) {
        $("parkForm").addEventListener("submit", (e) => {
            e.preventDefault();
            const plate = $("parkVehicle").value;
            const type = $("parkVehicleType") ? $("parkVehicleType").value : "sedan";
            const zone = $("parkZoneSelect") ? $("parkZoneSelect").value : "auto";
            const driver = $("parkDriverName") ? $("parkDriverName").value : "";
            const phone = $("parkDriverPhone") ? $("parkDriverPhone").value : "";

            if (parkVehicle(plate, type, zone, driver, phone)) {
                $("parkVehicle").value = "";
                if ($("parkDriverName")) $("parkDriverName").value = "";
                if ($("parkDriverPhone")) $("parkDriverPhone").value = "";
            }
        });
    }

    // 3. Search Form
    if ($("searchForm")) {
        $("searchForm").addEventListener("submit", (e) => {
            e.preventDefault();
            performSearch($("searchVehicle").value);
        });
    }

    // 4. Remove / Exit Form
    if ($("removeForm")) {
        $("removeForm").addEventListener("submit", (e) => {
            e.preventDefault();
            const plate = $("removeVehicle").value;
            const tender = $("exitPaymentMethod") ? $("exitPaymentMethod").value : "UPI / QR Code";
            if (exitVehicle(plate, tender)) {
                $("removeVehicle").value = "";
            }
        });
    }

    // 5. Profile Form
    if ($("profileForm")) {
        $("profileForm").addEventListener("submit", (e) => {
            e.preventDefault();
            const name = $("profileNameInput").value.trim();
            const phone = $("profilePhoneInput").value.trim();
            if (name.length < 2) {
                showToast("Enter a valid name.");
                return;
            }
            if (currentUser) {
                currentUser.name = name;
                currentUser.phone = phone;
                localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(currentUser));
                updateProfileUI();
                showToast("Profile details updated.");
            }
        });
    }
}

function setupControls() {
    // CSV Download
    if ($("downloadCsvBtn")) $("downloadCsvBtn").addEventListener("click", downloadCSV);

    // Reset History
    if ($("resetHistoryBtn")) {
        $("resetHistoryBtn").addEventListener("click", () => {
            openConfirmModal("Clear History?", "All completed session records will be permanently removed.", () => {
                history = [];
                saveData();
                renderAll();
                showToast("History log cleared.");
            });
        });
    }

    // Clear All Lot Data
    const handleReset = () => {
        openConfirmModal("Purge Parking Data?", "Removes all currently parked vehicles and transaction history.", () => {
            activeVehicles = [];
            history = [];
            telemetryLogs = [];
            saveData();
            renderAll();
            showToast("Parking facility reset.");
        });
    };
    if ($("resetAppBtn")) $("resetAppBtn").addEventListener("click", handleReset);
    if ($("settingsResetBtn")) $("settingsResetBtn").addEventListener("click", handleReset);

    // Populate Lot with sample vehicles
    if ($("loadDemoBtn")) {
        $("loadDemoBtn").addEventListener("click", () => {
            openConfirmModal("Populate Parking Bays?", "Adds 6 sample vehicles across different zones.", () => {
                seedInitialLot();
                renderAll();
                showToast("Sample vehicles checked into parking bays.");
            });
        });
    }

    // Traffic Simulation Toggles
    if ($("toggleSimBtn")) $("toggleSimBtn").addEventListener("click", toggleTrafficSimulation);
    if ($("analyticsToggleSim")) $("analyticsToggleSim").addEventListener("click", toggleTrafficSimulation);

    // Sim Speed
    if ($("simSpeedSelect")) {
        $("simSpeedSelect").addEventListener("change", (e) => {
            simSpeed = parseInt(e.target.value, 10) || 10000;
            if (isSimulating) {
                startTrafficSimulation();
                showToast(`Simulation cadence set to ${simSpeed / 1000}s`);
            }
        });
    }

    // Gate Sensor Manual Pulses
    if ($("gate1ManualPulse")) {
        $("gate1ManualPulse").addEventListener("click", () => {
            const randomPlate = SAMPLE_PLATES[Math.floor(Math.random() * SAMPLE_PLATES.length)]
                + (Math.floor(Math.random() * 89) + 10);
            parkVehicle(randomPlate, "sedan", "A");
        });
    }
    if ($("gate2ManualPulse")) {
        $("gate2ManualPulse").addEventListener("click", () => {
            if (activeVehicles.length > 0) {
                exitVehicle(activeVehicles[0].vehicle);
            } else {
                showToast("No parked vehicles to exit.");
            }
        });
    }

    // Clear Stream Log
    if ($("clearStreamBtn")) {
        $("clearStreamBtn").addEventListener("click", () => {
            telemetryLogs = [];
            renderTelemetryLogStreams();
            showToast("Telemetry stream cleared.");
        });
    }

    // Theme Selector
    if ($("themeSelect")) {
        $("themeSelect").addEventListener("change", (e) => {
            settings.theme = e.target.value;
            saveSettings();
            applySettings();
            showToast("Theme updated.");
        });
    }

    // Switches
    if ($("compactToggle")) {
        $("compactToggle").addEventListener("change", (e) => {
            settings.compact = e.target.checked;
            saveSettings();
            applySettings();
        });
    }
    if ($("notificationToggle")) {
        $("notificationToggle").addEventListener("change", (e) => {
            settings.notifications = e.target.checked;
            saveSettings();
        });
    }
    if ($("autoSaveToggle")) {
        $("autoSaveToggle").addEventListener("change", (e) => {
            settings.autoSave = e.target.checked;
            saveSettings();
            if (settings.autoSave) saveData();
        });
    }
    if ($("timeToggle")) {
        $("timeToggle").addEventListener("change", (e) => {
            settings.time24 = e.target.checked;
            saveSettings();
            renderAll();
        });
    }
    if ($("soundToggle")) {
        $("soundToggle").addEventListener("change", (e) => {
            settings.sound = e.target.checked;
            saveSettings();
        });
    }

    // Tariff Rates
    if ($("saveTariffsBtn")) {
        $("saveTariffsBtn").addEventListener("click", () => {
            settings.rates.sedan = Number($("rateSedanInput").value) || 40;
            settings.rates.suv = Number($("rateSuvInput").value) || 50;
            settings.rates.ev = Number($("rateEvInput").value) || 60;
            settings.rates.bike = Number($("rateBikeInput").value) || 20;
            saveSettings();
            renderAll();
            showToast("Tariff rates updated successfully.");
        });
    }
}

/* ZONE & STATUS FILTER PILLS */
function setupZoneFilters() {
    document.querySelectorAll(".zone-pill").forEach(pill => {
        pill.addEventListener("click", () => {
            document.querySelectorAll(".zone-pill").forEach(p => p.classList.remove("active"));
            pill.classList.add("active");
            currentZoneFilter = pill.dataset.zone || "all";
            renderParkingGrids();
        });
    });

    document.querySelectorAll(".filter-chip").forEach(chip => {
        chip.addEventListener("click", () => {
            document.querySelectorAll(".filter-chip").forEach(c => c.classList.remove("active"));
            chip.classList.add("active");
            currentStatusFilter = chip.dataset.status || "all";
            renderParkingGrids();
        });
    });
}

/* =========================================================
   NAVIGATION (DESKTOP & MOBILE BOTTOM BAR)
   ========================================================= */
function setupNavigation() {
    document.querySelectorAll(".nav-item").forEach(btn => {
        btn.addEventListener("click", () => {
            navigateTo(btn.dataset.section);
        });
    });

    document.querySelectorAll("[data-go]").forEach(btn => {
        btn.addEventListener("click", () => {
            navigateTo(btn.dataset.go);
        });
    });
}

function navigateTo(section) {
    document.querySelectorAll(".page-section").forEach(p => p.classList.remove("active-section"));

    const target = $(section);
    if (target) {
        target.classList.add("active-section");
    }

    // Active state in sidebar & bottom nav
    document.querySelectorAll(".nav-item").forEach(b => {
        b.classList.toggle("active", b.dataset.section === section);
    });
    document.querySelectorAll(".bottom-nav-item").forEach(b => {
        if (b.dataset.section) {
            b.classList.toggle("active", b.dataset.section === section);
        }
    });

    const titles = {
        dashboard: "Dashboard Command",
        parking: "Live Parking Map & Zones",
        operations: "Gate Operations & Cashier",
        history: "Audit Log & Financials",
        analytics: "Live Sensor Feed & Telemetry",
        profile: "Terminal Profile",
        settings: "Settings & Tariffs"
    };

    if ($("currentPageName")) $("currentPageName").textContent = titles[section] || "Dashboard";
    if ($("pageTitle")) $("pageTitle").textContent = titles[section] || "Dashboard";
    if ($("mobileHeaderTitle")) $("mobileHeaderTitle").textContent = titles[section] || "ParkHash";

    closeMobileDrawer();
    window.scrollTo({ top: 0, behavior: "smooth" });
}

/* =========================================================
   MOBILE DRAWER & BOTTOM BAR
   ========================================================= */
function setupMobileApp() {
    const drawerOpenBtn = $("mobileDrawerOpenBtn");
    const drawerCloseBtn = $("mobileDrawerCloseBtn");
    const drawerOverlay = $("mobileDrawerOverlay");
    const bottomMenuBtn = $("mobileBottomMenuBtn");

    if (drawerOpenBtn) drawerOpenBtn.addEventListener("click", openMobileDrawer);
    if (bottomMenuBtn) bottomMenuBtn.addEventListener("click", openMobileDrawer);
    if (drawerCloseBtn) drawerCloseBtn.addEventListener("click", closeMobileDrawer);
    if (drawerOverlay) drawerOverlay.addEventListener("click", closeMobileDrawer);

    document.querySelectorAll(".bottom-nav-item").forEach(b => {
        b.addEventListener("click", () => {
            if (b.dataset.section) navigateTo(b.dataset.section);
        });
    });
}

function openMobileDrawer() {
    if ($("mobileDrawer")) $("mobileDrawer").classList.remove("hidden");
    if ($("mobileDrawerOverlay")) $("mobileDrawerOverlay").classList.remove("hidden");
}

function closeMobileDrawer() {
    if ($("mobileDrawer")) $("mobileDrawer").classList.add("hidden");
    if ($("mobileDrawerOverlay")) $("mobileDrawerOverlay").classList.add("hidden");
}

/* =========================================================
   PROFILE & HELPERS
   ========================================================= */
function updateProfileUI() {
    if (!currentUser) return;
    const initials = currentUser.name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(w => w[0])
        .join("")
        .toUpperCase() || "OP";

    if ($("sidebarAvatar")) $("sidebarAvatar").textContent = initials;
    if ($("profileAvatar")) $("profileAvatar").textContent = initials;
    if ($("mobileHeaderAvatar")) $("mobileHeaderAvatar").textContent = initials;
    if ($("drawerAvatar")) $("drawerAvatar").textContent = initials;

    if ($("sidebarName")) $("sidebarName").textContent = currentUser.name;
    if ($("sidebarEmail")) $("sidebarEmail").textContent = currentUser.email;
    if ($("drawerName")) $("drawerName").textContent = currentUser.name;
    if ($("drawerEmail")) $("drawerEmail").textContent = currentUser.email;
    if ($("profileName")) $("profileName").textContent = currentUser.name;
    if ($("profileEmail")) $("profileEmail").textContent = currentUser.email;

    if ($("profileNameInput")) $("profileNameInput").value = currentUser.name;
    if ($("profileEmailInput")) $("profileEmailInput").value = currentUser.email;
    if ($("profilePhoneInput")) $("profilePhoneInput").value = currentUser.phone || "";

    if ($("profileSessions")) $("profileSessions").textContent = activeVehicles.length + history.length;
    if ($("profileCompleted")) $("profileCompleted").textContent = history.length;
    if ($("profileActive")) $("profileActive").textContent = activeVehicles.length;
}

function formatTypeLabel(type = "sedan") {
    switch (type) {
        case "suv": return "SUV / 4x4";
        case "ev": return "Electric EV";
        case "bike": return "Motorcycle";
        case "sedan":
        default: return "Car / Sedan";
    }
}

function formatDateTime(value) {
    if (!value) return "—";
    const date = new Date(value);
    return date.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: !settings.time24
    });
}

function formatDuration(entry, exit = null) {
    if (!entry) return "0s";
    const start = new Date(entry).getTime();
    const end = exit ? new Date(exit).getTime() : Date.now();
    let seconds = Math.max(Math.floor((end - start) / 1000), 0);

    const hours = Math.floor(seconds / 3600);
    seconds %= 3600;
    const minutes = Math.floor(seconds / 60);
    seconds %= 60;

    const pad = (n) => String(n).padStart(2, "0");
    if (hours > 0) return `${hours}h ${pad(minutes)}m ${pad(seconds)}s`;
    if (minutes > 0) return `${minutes}m ${pad(seconds)}s`;
    return `${seconds}s`;
}

/* CSV EXPORT */
function downloadCSV() {
    const records = [
        ...activeVehicles.map(v => ({ ...v, status: "IN LOT" })),
        ...history.map(h => ({ ...h, status: "COMPLETED" }))
    ];

    if (records.length === 0) {
        showToast("No parking records to download.");
        return;
    }

    const headers = ["Vehicle Plate", "Category", "Bay", "Check-In", "Check-Out", "Duration", "Amount Paid", "Payment Mode", "Status"];
    const rows = records.map(r => [
        r.vehicle,
        formatTypeLabel(r.type),
        r.slot || "",
        formatDateTime(r.entryTime),
        r.exitTime ? formatDateTime(r.exitTime) : "Active",
        formatDuration(r.entryTime, r.exitTime),
        r.feeCharged || calculateParkingFee(r.entryTime, null, r.type),
        r.paymentMethod || "FASTag",
        r.status
    ]);

    const csvContent = [headers, ...rows].map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `parkhash-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Audit CSV exported successfully.");
}

/* TOAST NOTIFICATION */
let toastTimeout = null;
function showToast(msg) {
    if (currentUser && settings.notifications === false) return;
    const toast = $("toast");
    const toastMsg = $("toastMessage");
    if (!toast || !toastMsg) return;

    toastMsg.textContent = msg;
    toast.classList.add("show");
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.classList.remove("show");
    }, 2800);
}