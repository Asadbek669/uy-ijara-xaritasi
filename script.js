// API base URL
const API_BASE = 'https://backend-api-rtej.onrender.com/api';
// URL orqali user_id kelsa – localStorage ga saqlaymiz
const urlParams = new URLSearchParams(window.location.search);
const tgUserId = urlParams.get("user_id");
if (tgUserId) {
    localStorage.setItem("tg_user_id", tgUserId);
}

// Global o'zgaruvchilar
let map;
let markers = [];
let markerCluster;

// Xaritani ishga tushirish
function initMap() {
    // O'zbekiston markazi
    const defaultCenter = [41.2995, 69.2401];

    // Xaritani yaratish (retina uchun optimizatsiya)
    map = L.map('map', {
        preferCanvas: true,
        zoomSnap: 0.25,
        zoomDelta: 0.5,
        wheelPxPerZoomLevel: 80,
        zoomControl: true,
        attributionControl: true,
        zoomAnimation: true,
        fadeAnimation: true,
        inertia: true,
        inertiaDeceleration: 2500,
    }).setView(defaultCenter, 12);
    
    // Retina uchun maxsimal tiniqlik
    const retinaTiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 20,
        tileSize: 512,          // 2× sifatli rasm yuklaydi
        zoomOffset: -1,         // to‘g‘ri zoomni beradi
        detectRetina: true,     // retina ekranlarni avtomatik aniqlaydi
        crossOrigin: true,      // renderda tiniqlik uchun muhim
        attribution: '&copy; OpenStreetMap contributors'
    });
    retinaTiles.addTo(map);




    // Marker cluster guruhi
    markerCluster = L.markerClusterGroup({
        chunkedLoading: true,
        maxClusterRadius: 50
    });

    map.addLayer(markerCluster);

    // Mobil uchun silliq zoom va touch optimizatsiya
    map.touchZoom.enable();
    map.doubleClickZoom.enable();
    map.scrollWheelZoom.disable(); // ixtiyoriy — mobil uchun foydali
    map.invalidateSize();

    // E'lonlarni yuklash
    loadListings();
}


// Rasm URL olish
function getPhotoUrl(fileId) {
    if (!fileId) {
        return 'https://via.placeholder.com/150/3498db/ffffff?text=Rasm+Yoq';
    }
    return `${API_BASE}/photos/${encodeURIComponent(fileId)}`;
}

// E'lonlarni API dan olish
async function loadListings() {
    const params = new URLSearchParams(window.location.search);
    const lat = params.get("lat");
    const lon = params.get("lon");
    const radius = params.get("radius") || 20;

    let url = `${API_BASE}/listings`;

    if (lat && lon) {
        url = `${API_BASE}/listings/nearby?lat=${lat}&lon=${lon}&radius_km=${radius}`;
        map.setView([parseFloat(lat), parseFloat(lon)], 13);
    }

    try {
        const response = await fetch(url);
        const data = await response.json();

        // ✅ har ikki formatni qo‘llaydigan universal forma
        const listings = Array.isArray(data) ? data : data.listings;
		displayListings(listings);
		hideLoading();

        if (!Array.isArray(listings) || listings.length === 0) {
            console.warn("⚠️ E'lonlar topilmadi yoki noto‘g‘ri format");
            return;
        }



    } catch (error) {
        console.error("🚫 Xarita yuklashda xatolik:", error);
    }
}

function saveListing(listingId) {
    const userId = localStorage.getItem("tg_user_id");

    if (!userId) {
        alert("❗Avval Telegram orqali oching!");
        return;
    }

    fetch(`${API_BASE}/save-listing/${listingId}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ user_id: userId }),
    })
    .then(res => res.json())
    .then(data => {
        alert("✅ E’lon Telegramga yuborildi!");
    })
    .catch(() => alert("❌ Xato! Qayta urinib ko‘ring"));
}



// E'lonlarni xaritada ko'rsatish
function displayListings(listings) {
    // Eski markerlarni tozalash
    markerCluster.clearLayers();
    markers = [];
    
    if (listings.length === 0) {
        updateStats(0);
        return;
    }
    
    // Har bir e'lon uchun marker yaratish
    listings.forEach(listing => {
        const marker = createMarker(listing);
        markers.push(marker);
        markerCluster.addLayer(marker);
    });
    
    // Xaritani markerlar joylashganiga moslashtirish
    if (markers.length > 0) {
        const group = new L.featureGroup(markers);
        map.fitBounds(group.getBounds(), { padding: [20, 20] });
    }
    
    updateStats(listings.length);
}

// Marker yaratish
function createMarker(listing) {
    const { latitude, longitude, title, price } = listing;
    
    // Marker icon
    const icon = L.divIcon({
        html: `
            <div style="
                background: #e74c3c;
                color: white;
                padding: 8px 12px;
                border-radius: 20px;
                font-weight: bold;
                font-size: 14px;
                border: 3px solid white;
                box-shadow: 0 2px 10px rgba(0,0,0,0.3);
                white-space: nowrap;
            ">
                💰 ${formatPrice(price)}
            </div>
        `,
        className: 'custom-marker',
        iconSize: [100, 40],
        iconAnchor: [50, 40]
    });
    
    // Marker yaratish
    const marker = L.marker([latitude, longitude], { icon });
    
    // Popup content
    const popupContent = createPopupContent(listing);
    
    marker.bindPopup(popupContent, {
        maxWidth: 400,
        className: 'custom-popup',
        minWidth: 300
    });
    
    return marker;
}

function callNumber(phone) {
    const tg = window.Telegram?.WebApp;

    if (tg && typeof tg.openLink === "function") {
        // ✅ Telegram WebApp ichida ishlaydi
        tg.openLink(`tel:${phone}`);
    } else {
        // 🌐 Oddiy brauzerda ishlaydi
        window.location.href = `tel:${phone}`;
    }
}


// Popup content yaratish
function createPopupContent(listing) {
    const {
        id, title, price, description, photos,
        owner_name, phone, distance_km
    } = listing;

    const phoneDisplay = phone ? `+998${phone.replace(/^(\+?998)?/, '')}` : "No'malum";
    const callButton = phone
        ? `<a href="tel:${phoneDisplay}" target="_blank" class="call-btn">📞 Qo‘ng‘iroq qilish</a>`
        : '';

    const shortDesc = escapeHtml(description || "Tavsif mavjud emas");
    const descHTML = `
        <div class="listing-description" id="desc-${id}">
            ${shortDesc}
        </div>
        <span class="read-more-btn" onclick="toggleDescription(${id})">Batafsil…</span>
    `;

    let photosHTML = '';
    if (photos && photos.length > 0) {
        photosHTML = `
            <div class="photos-gallery">
                <div class="photos-slider">
                    ${photos.map(photo => `
                        <img src="${getPhotoUrl(photo)}" loading="lazy"
                        onerror="this.src='https://via.placeholder.com/300x200?text=Rasm+Yuklanmadi'">
                    `).join('')}
                </div>
                <div class="photo-count">${photos.length} ta rasm</div>
            </div>
        `;
    }

    return `
        <div class="listing-popup">
            <div class="listing-title">${escapeHtml(title)}</div>
            <div class="listing-price">${formatPrice(price)} so'm/oy</div>
            ${descHTML}
            ${photosHTML}

            ${callButton}

            <button class="telegram-btn" onclick="saveListing(${id})">
                💾 E’lonni saqlash
            </button>
        </div>
    `;
}


// Batafsil ma'lumot ko'rsatish
function showListingDetails(listingId) {
    // Telegram bot orqali ma'lumot yuborish
    const telegramBotUrl = `https://t.me/testuchun878_bot?start=listing_${listingId}`;
    
    // Yangi oynada ochish yoki foydalanuvchiga ko'rsatish
    const userChoice = confirm(
        "Batafsil ma'lumot olish uchun Telegram botga yo'naltirilmoqdasiz. Davom etasizmi?"
    );
    
    if (userChoice) {
        window.open(telegramBotUrl, '_blank');
        
        // Yoki foydalanuvchiga linkni ko'rsatish
        showTelegramLink(listingId);
    }
}

// Telegram linkini ko'rsatish
function showTelegramLink(listingId) {
    const telegramUrl = `https://t.me/testuchun878_bot?start=listing_${listingId}`;
    
    // Modal yoki alert orqali linkni ko'rsatish
    const modal = document.createElement('div');
    modal.className = 'telegram-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <h3>📋 Batafsil ma'lumot olish</h3>
            <p>Quyidagi linkni Telegram'da oching yoki botga <code>/start listing_${listingId}</code> deb yozing:</p>
            <div class="telegram-link">
                <a href="${telegramUrl}" target="_blank">${telegramUrl}</a>
            </div>
            <button onclick="copyTelegramLink('${telegramUrl}')" class="copy-btn">
                📋 Linkni nusxalash
            </button>
            <button onclick="closeModal()" class="close-btn">Yopish</button>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Modalga style qo'shish
    const style = document.createElement('style');
    style.textContent = `
        .telegram-modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 3000;
        }
        .modal-content {
            background: white;
            padding: 20px;
            border-radius: 10px;
            max-width: 500px;
            width: 90%;
            text-align: center;
        }
        .telegram-link {
            margin: 15px 0;
            padding: 10px;
            background: #f8f9fa;
            border-radius: 5px;
            word-break: break-all;
        }
        .telegram-link a {
            color: #3498db;
            text-decoration: none;
        }
        .copy-btn, .close-btn {
            background: #3498db;
            color: white;
            border: none;
            padding: 10px 15px;
            border-radius: 5px;
            cursor: pointer;
            margin: 5px;
        }
        .close-btn {
            background: #e74c3c;
        }
        .copy-btn:hover {
            background: #2980b9;
        }
        .close-btn:hover {
            background: #c0392b;
        }
    `;
    document.head.appendChild(style);
}



// Modalni yopish
function closeModal() {
    const modal = document.querySelector('.telegram-modal');
    if (modal) {
        modal.remove();
    }
}

// Narxni formatlash
function formatPrice(price) {
    return new Intl.NumberFormat('uz-UZ').format(Math.round(price));
}

// HTML escape qilish
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Statistikani yangilash
function updateStats(count) {
    const statsElement = document.getElementById('stats');
    statsElement.textContent = `Jami ${count} ta e'lon`;
}

// Loading ko'rsatkichlari
function showLoading() {
    document.getElementById('loading').classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('loading').classList.add('hidden');
}

// Xatolik ko'rsatkichlari
function showError() {
    document.getElementById('error').classList.remove('hidden');
}

function hideError() {
    document.getElementById('error').classList.add('hidden');
}

// Debug funksiyasi
function debugPhotos() {
    fetch(`${API_BASE}/listings`)
        .then(response => response.json())
        .then(listings => {
            console.log('=== DEBUG PHOTOS ===');
            listings.forEach((listing, index) => {
                console.log(`Listing ${index + 1}:`, listing.title);
                console.log('Photos:', listing.photos);
                if (listing.photos) {
                    listing.photos.forEach((photo, photoIndex) => {
                        const url = getPhotoUrl(photo);
                        console.log(`Photo ${photoIndex + 1}:`, url);
                    });
                }
            });
        });
}

// Sahifa yuklanganda
document.addEventListener('DOMContentLoaded', function() {
    initMap();
    window.debugPhotos = debugPhotos;

});



function toggleDescription(id) {
    const desc = document.getElementById(`desc-${id}`);
    const btn = event.target;

    if (desc.classList.contains("expanded")) {
        desc.classList.remove("expanded");
        btn.textContent = "Batafsil…";
    } else {
        desc.classList.add("expanded");
        btn.textContent = "Yopish";
    }
}




