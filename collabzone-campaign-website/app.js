import {
  addNotificationCloud,
  CAMPAIGN_CREATION_COST,
  createAccount,
  createCampaignCloud,
  createCampaignProgramCloud,
  createTopupRequestCloud,
  firebaseConfigured,
  firebaseConfigurationIncomplete,
  loadCloudState,
  markNotificationsReadCloud,
  observeAuth,
  reviewVerificationRequestCloud,
  signInAccount,
  signOutAccount,
  subscribeCampaignProgramsCloud,
  subscribeNotificationsCloud,
  subscribeTopupRequestsCloud,
  subscribeUserProfileCloud,
  getTopupReceiptCloud,
  getTopupReceiptUrlCloud,
  submitVerificationRequestCloud,
  submitApplicationCloud,
  updateCampaignCloud,
  updateCampaignTermsCloud,
  updateUserProfileCloud,
  updateApplicationCloud,
  reviewTopupRequestCloud,
  ensureConversationCloud,
  subscribeConversationsCloud,
  subscribeMessagesCloud,
  sendChatMessageCloud,
  markConversationReadCloud,
  markRegularApplicationCompletedCloud
} from "./firebase.js";

const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const app = $("#app");
const toastBox = $("#toast");
const DB_KEY = "collabzone_demo_v1";
const DEFAULT_CAMPAIGN_PROGRAMS = [{id:"umkm",name:"Bantu UMKM",description:"Campaign spesial untuk membantu UMKM.",active:true}];
let state = loadState();
let currentUser = null;
let authMode = "signup";
let activePage = "home";
let activeApplicationCategory = "pending";
let detailCampaignId = null;
let applicantCampaignId = null;
let uploadedBanner = "";
let bannerUploadInProgress = false;
let bannerUploadRequest = 0;
let uploadedTopupProof = "";
let topupProofProcessing = false;
let topupProofRequest = 0;
let pendingProfilePhoto = "";
let profilePhotoRequest = 0;
let authFlowInProgress = false;
let unsubscribeNotifications = null;
let unsubscribeUserProfile = null;
let unsubscribeCampaignPrograms = null;
let unsubscribeTopupRequests = null;
let unsubscribeConversations = null;
let unsubscribeMessages = null;
let activeConversationId = null;
let chatOpen = false;
const ADMIN_WHATSAPP_URL = "https://wa.me/6285977233440";

function loadState(){
  try {
    const s = JSON.parse(localStorage.getItem(DB_KEY));
    if(s && Array.isArray(s.campaigns)) return {
     ...s,
     users:firebaseConfigured?s.users:(s.users||[]).map(user=>user.role==="brand"?{...user,balance:0}:user),
     specialPrograms:mergeCampaignPrograms(s.specialPrograms||[]),
     topupRequests:s.topupRequests||[],
     conversations:s.conversations||[],
     chatMessages:s.chatMessages||{}
    };
  } catch(e){}
  return {
    users: [],
    specialPrograms: DEFAULT_CAMPAIGN_PROGRAMS,
    campaigns: [
      {id:"demo1",brandName:"SkinGlow",ownerEmail:"demo@skinglow.id",type:"regular",title:"#GlowWithSkinGlow",description:"Ajak audiens menemukan rutinitas perawatan kulit yang sederhana dan menyenangkan bersama SkinGlow.",terms:"1. Follow akun Instagram @skinglow.id\n2. Buat konten sesuai brief yang diberikan\n3. Cantumkan produk SkinGlow dalam video\n4. Konten tidak boleh dihapus selama 30 hari.",fee:0,videoCount:0,reward:"Voucher Produk",banner:"",slots:5,applicants:[],createdAt:Date.now()-100000},
      {id:"demo2",brandName:"CoffeeTime",ownerEmail:"demo@coffeetime.id",type:"special",title:"#RasaYangMenyatukan",description:"Buat video kreatif tentang momen ngopi dan kenalkan varian favorit CoffeeTime kepada audiensmu.",terms:"1. Follow akun @coffeetime\n2. Buat video vertikal 9:16\n3. Tampilkan produk dengan jelas\n4. Kirim konten sesuai tenggat campaign.",fee:150000,videoCount:3,reward:"Fee per paket video",banner:"",slots:5,applicants:[],createdAt:Date.now()-50000},
      {id:"demo3",brandName:"FitLife",ownerEmail:"demo@fitlife.id",type:"regular",title:"#LebihSehatBersamaFitLife",description:"Bagikan kebiasaan sehatmu dan ceritakan bagaimana FitLife menemani aktivitas harian.",terms:"1. Konten harus original\n2. Tag akun resmi FitLife\n3. Kirim link konten setelah tayang.",fee:0,videoCount:0,reward:"Produk Gratis",banner:"",slots:5,applicants:[],createdAt:Date.now()-20000}
    ],
    notifications: [],
    topupRequests: [],
    conversations: [],
    chatMessages: {}
  };
}
function save(){ if(!firebaseConfigured) localStorage.setItem(DB_KEY, JSON.stringify(state)); }
function esc(s=""){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function mergeCampaignPrograms(programs=[]){
 const byId=new Map(DEFAULT_CAMPAIGN_PROGRAMS.map(program=>[program.id,program]));
 for(const program of programs){
  if(program?.id&&program.id!=="umkm"&&program.active!==false)byId.set(String(program.id),program);
 }
 return [...byId.values()];
}
function campaignProgramName(programId){
 if(programId==="available")return "Program Tersedia";
 return state.specialPrograms.find(program=>program.id===programId)?.name||"Bantu UMKM";
}
function rupiah(n){return new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(n)||0);}
function parseRupiahInput(value){const digits=String(value??"").replace(/\D/g,"");return digits?Number(digits):0;}
function formatRupiahInput(input){
 const start=input.selectionStart??input.value.length;
 const digitsBeforeCaret=input.value.slice(0,start).replace(/\D/g,"").length;
 const digits=input.value.replace(/\D/g,"");
 input.value=digits?new Intl.NumberFormat("id-ID").format(Number(digits)):"";
 let caret=0,seen=0;
 while(caret<input.value.length&&seen<digitsBeforeCaret){
  if(/\d/.test(input.value[caret]))seen++;
  caret++;
 }
 input.setSelectionRange(caret,caret);
}
function toast(msg){toastBox.textContent=msg;toastBox.classList.add("show");setTimeout(()=>toastBox.classList.remove("show"),2800);}
async function withCampaignSaveState(form,saveRequest){
 const button=form.querySelector('button[type="submit"]');
 const original=button?.innerHTML;
 if(button){
  button.disabled=true;
  button.innerHTML='<span class="banner-upload-spinner" aria-hidden="true"></span> Menyimpan campaign…';
 }
 try{
  return await saveRequest();
 }finally{
  if(button?.isConnected){
   button.disabled=false;
   button.innerHTML=original;
  }
 }
}
function initials(s="User"){return s.trim().split(/\s+/).slice(0,2).map(x=>x[0]||"").join("").toUpperCase();}
function avatarContent(name,photoData=""){return photoData?`<img src="${esc(photoData)}" alt="Foto profil" style="width:100%;height:100%;border-radius:inherit;object-fit:cover">`:esc(initials(name));}
async function compressProfilePhoto(file){
 if(!file.type.startsWith("image/"))throw new Error("Pilih file gambar untuk foto profil.");
 if(file.size>5*1024*1024)throw new Error("Ukuran foto maksimal 5 MB.");
 const image=await createImageBitmap(file);
 try{
  const size=256,canvas=document.createElement("canvas");
  canvas.width=size;canvas.height=size;
  const context=canvas.getContext("2d");
  if(!context)throw new Error("Browser tidak dapat memproses foto.");
  const cropSize=Math.min(image.width,image.height);
  context.drawImage(image,(image.width-cropSize)/2,(image.height-cropSize)/2,cropSize,cropSize,0,0,size,size);
  return canvas.toDataURL("image/jpeg",.82);
 }finally{image.close();}
}
function campaignById(id){return state.campaigns.find(c=>c.id===id);}
function missingKolProfileFields(){
 if(currentUser?.role!=="kol")return [];
 return [
  ["name","nama lengkap"],
  ["photoData","foto profil"],
 ].filter(([field])=>!String(currentUser[field]||"").trim()).map(([,label])=>label)
  .concat(!hasValidKolSocialLink()?["link Instagram atau TikTok"]:[]);
}
function kolProfileComplete(){return missingKolProfileFields().length===0;}
function hasValidKolSocialLink(){
 return ["instagram","tiktok"].some(field=>isProfileSocialUrl(field,String(currentUser?.[field]||"")));
}
function socialVerificationStatusForUser(user,field){
 const explicitStatus=user?.[`${field}VerificationStatus`];
 if(explicitStatus)return explicitStatus;
 if(!user?.instagramVerificationStatus&&!user?.tiktokVerificationStatus){
  return user?.verificationStatus==="approved"&&isProfileSocialUrl(field,String(user?.[field]||""))
   ?"approved":user?.verificationStatus==="pending"&&isProfileSocialUrl(field,String(user?.[field]||""))
    ?"pending":user?.verificationStatus==="rejected"&&isProfileSocialUrl(field,String(user?.[field]||""))
     ?"rejected":"not_requested";
 }
 return "not_requested";
}
function socialVerificationStatus(field){return socialVerificationStatusForUser(currentUser,field);}
function hasRegularApplication(){
 return currentUser?.regularApplicationCompleted===true
  || myApplications().some(application=>application.campaign?.type==="regular");
}
function kolProfileApproved(){return currentUser?.role==="kol"&&currentUser.verificationStatus==="approved"&&kolProfileComplete();}
function kolVerified(){return kolProfileApproved()&&hasRegularApplication();}
function kolVerificationProgress(){
 const steps=[
  Boolean(String(currentUser?.photoData||"").trim()),
  Boolean(String(currentUser?.name||"").trim()),
  hasValidKolSocialLink(),
  hasRegularApplication(),
  kolProfileApproved()
 ];
 return {steps,completed:steps.filter(Boolean).length,percent:steps.filter(Boolean).length*20};
}
function canApplyToCampaign(campaign){
 if(currentUser?.role!=="kol")return false;
 return campaign.type==="regular"||kolVerified();
}
function verifiedMark(){return `<span class="verified-check" role="img" aria-label="KOL terverifikasi" title="KOL terverifikasi">✓</span>`;}
function kolProfileIncompleteMessage(){
 const missing=missingKolProfileFields();
 return missing.length?`Lengkapi profil dulu (${missing.join(", ")}) sebelum mengajukan campaign.`:"";
}
function applicantCount(c){return Number(c.applicantsCount??(c.applicants||[]).length);}
function remaining(c){return Math.max(0,(Number(c.slots)||5)-applicantCount(c));}
function progress(c){return Math.min(100,Math.round((applicantCount(c)/(Number(c.slots)||5))*100));}
function typeBadge(c){return `<span class="badge ${c.type==="regular"?"badge-regular":"badge-special"}">${c.type==="regular"?"Regular":"Spesial"}</span>`;}
function campaignCpm(c){return Number(c?.cpm??c?.fee)||0;}
function feeBlock(c){
  if(c.type==="regular") return `<div class="fee-box"><div class="fee-label">Sistem pembayaran</div><div class="fee-value">Pengajuan Fee</div><div class="fee-sub">KOL mengajukan nominal fee sendiri</div></div>`;
  if(c.cpm!==undefined||!Number(c.videoCount))return `<div class="fee-box"><div class="fee-label">CPM (Cost Per Mille)</div><div class="fee-value">${rupiah(campaignCpm(c))} <span style="font-size:12px;font-weight:600;color:#77758f">/ 1.000 tayangan</span></div><div class="fee-sub">Biaya per seribu tayangan</div></div>`;
  return `<div class="fee-box"><div class="fee-label">Fee ditentukan brand</div><div class="fee-value">${rupiah(c.fee)} <span style="font-size:12px;font-weight:600;color:#77758f">/ ${c.videoCount} video</span></div><div class="fee-sub">Paket fee sesuai jumlah video</div></div>`;
}
function banner(c, cls=""){
  if(c.banner) return `<div class="campaign-banner ${cls}"><img src="${c.banner}" alt="Banner ${esc(c.title)}"><span class="banner-tag">${c.type==="regular"?"REGULAR":"SPESIAL"}</span></div>`;
  const gradient = c.type==="regular"?"linear-gradient(135deg,#b5a9ff,#e7a7d2)":"linear-gradient(135deg,#30295f,#bd8d66)";
  return `<div class="campaign-banner ${cls}" style="background:${gradient}"><div class="banner-fallback" style="background:${gradient}">${esc(c.brandName)}</div><span class="banner-tag">${c.type==="regular"?"REGULAR":"SPESIAL"}</span></div>`;
}
function campaignCard(c, mode="kol"){
  const n=applicantCount(c), left=remaining(c);
  return `<article class="campaign-card${mode==="kol"?" campaign-card-clickable":""}"${mode==="kol"?` data-card-detail="${esc(c.id)}" tabindex="0" role="button" aria-label="Lihat detail campaign ${esc(c.title)}"`:""}>
    ${banner(c)}
    <div class="campaign-body">
      <div class="campaign-brand">${esc(c.brandName)} &nbsp; ${typeBadge(c)}${c.type==="special"?` &nbsp; <span class="badge badge-regular">${esc(campaignProgramName(c.specialProgram||"umkm"))}</span>`:""}</div>
      <h3 class="campaign-title">${esc(c.title)}</h3>
      ${feeBlock(c)}
      <div class="campaign-meta"><span>${n}/${c.slots||5} KOL mendaftar</span><b>${progress(c)}%</b></div>
      <div class="progress"><span style="width:${progress(c)}%"></span></div>
      <div class="campaign-meta"><span>Sisa slot</span><b>${left} KOL</b></div>
      ${mode==="brand"?`<div class="card-actions"><button class="btn btn-outline" data-detail="${esc(c.id)}">Lihat Detail</button><button class="btn btn-primary" data-applicants="${esc(c.id)}">Pengajuan (${n})</button></div>`:`<div class="campaign-card-hint">Klik kartu untuk melihat detail</div>`}
    </div>
  </article>`;
}
function landing(){
 app.innerHTML=`<header class="container topnav"><a class="brand-logo" href="#" data-home><span class="logo-mark">C</span>CollabZone</a><nav class="navlinks"><a href="#fitur">Fitur</a><a href="#cara-kerja">Cara Kerja</a><a href="#tentang">Tentang</a></nav><div class="navactions"><button class="btn btn-outline" data-auth="login">Masuk</button><button class="btn btn-primary" data-role>Daftar</button></div></header>
 <main class="container"><section class="hero"><div class="hero-content"><span class="eyebrow">✦ Platform kolaborasi KOL & brand</span><h1>Jadi <span class="gradient-text">KOL.</span><br>Bis a Jadi Brand.</h1><p>Temukan campaign yang cocok, ajukan kerja sama, dan bangun kolaborasi yang saling menguntungkan dalam satu platform.</p><div class="hero-actions"><button class="btn btn-primary" data-role>Mulai Sekarang&nbsp; ↗</button><a class="btn btn-outline" href="#cara-kerja" style="color:#fff;border-color:#ffffff55;background:#ffffff0b">Pelajari Lebih Lanjut</a></div></div><div class="hero-visual"><div class="floating-card two"><b style="font-size:12px">✦ Campaign baru</b><div class="float-line" style="width:85%"></div><div class="float-line" style="width:65%"></div><span class="badge badge-regular">Regular</span></div><div class="floating-card one"><b style="font-size:12px">Kolaborasi berhasil ✨</b><div style="display:flex;align-items:center;gap:8px;margin-top:12px"><div class="avatar">SG</div><div><b style="font-size:11px">SkinGlow</b><div class="small muted">Campaign aktif</div></div></div><div class="float-line purple"></div><div class="small muted">3 dari 5 slot terisi</div></div></div></section>
 <section class="section" id="fitur"><div class="section-heading"><h2>Satu tempat untuk mulai kolaborasi</h2><p>Alur yang praktis untuk kreator konten dan brand mengelola campaign dengan lebih teratur.</p></div><div class="feature-grid"><div class="feature"><div class="feature-icon">✦</div><h3>Campaign Beragam</h3><p>Pilih campaign Regular dengan pengajuan fee atau Spesial dengan fee dan jumlah video yang sudah ditentukan brand.</p></div><div class="feature"><div class="feature-icon">↗</div><h3>Proses Lebih Mudah</h3><p>Lihat detail, pahami syarat, kirim pengajuan, dan pantau status kolaborasi dari dashboard.</p></div><div class="feature"><div class="feature-icon">♡</div><h3>Kolaborasi Terpantau</h3><p>Brand dapat melihat pengajuan KOL dan menerima notifikasi dalam satu tempat.</p></div></div></section>
 <section class="section" id="cara-kerja" style="padding-top:0"><div class="section-heading"><h2>Mulai dari peranmu</h2><p>Pilih jalur yang sesuai untuk masuk ke CollabZone.</p></div><div class="role-wrap"><div class="role-grid"><button class="role-card" data-role-select="kol"><div class="role-icon">◉</div><h3>Jadi KOL</h3><p>Temukan campaign, ajukan fee, dan kembangkan portofolio kolaborasimu.</p><span class="btn btn-primary">Daftar sebagai KOL →</span></button><button class="role-card" data-role-select="brand"><div class="role-icon">▦</div><h3>Jadi Brand</h3><p>Buat campaign dan kelola pengajuan kreator konten.</p><span class="btn btn-primary">Daftar sebagai Brand →</span></button></div></div></section></main><footer class="footer" id="tentang"><div class="container" style="display:flex;justify-content:space-between;gap:15px;flex-wrap:wrap"><span>© 2026 CollabZone</span><span>Tempat KOL dan brand bertemu.</span></div></footer>`;
}
function rolePage(mode="signup"){
 const isLogin=mode==="login";
 const action=isLogin?"Masuk":"Daftar";
 const roleAttribute=isLogin?"data-role-login":"data-role-select";
 app.innerHTML=`<div class="container"><header class="topnav"><a class="brand-logo" href="#" data-home><span class="logo-mark">C</span>CollabZone</a><div class="navactions"><button class="btn btn-outline" data-auth="admin">Masuk sebagai Admin</button><button class="btn btn-ghost" data-home>← Kembali ke beranda</button></div></header><div class="section"><div class="section-heading"><h2>${isLogin?"Masuk ke akunmu":"Mulai perjalananmu"}</h2><p>${isLogin?"Pilih peran akun yang ingin kamu gunakan untuk masuk.":"Pilih peran untuk melanjutkan ke pendaftaran atau login."}</p></div><div class="role-wrap"><div class="role-grid"><button class="role-card" ${roleAttribute}="kol"><div class="role-icon">◉</div><h3>KOL</h3><p>${isLogin?"Masuk untuk menemukan campaign dan mengelola kolaborasimu.":"Daftar campaign menarik dan ajukan fee sesuai kebutuhanmu."}</p><span class="btn btn-primary">${action} sebagai KOL →</span></button><button class="role-card" ${roleAttribute}="brand"><div class="role-icon">▦</div><h3>Brand</h3><p>${isLogin?"Masuk untuk membuat campaign dan mengelola pengajuan kreator.":"Buat campaign dan kelola pengajuan kreator konten."}</p><span class="btn btn-primary">${action} sebagai Brand →</span></button></div></div></div></div>`;
}
function authPage(role, mode="signup"){
 authMode=mode; const label=role==="kol"?"KOL":role==="admin"?"Admin":"Brand"; const isSignup=mode==="signup"&&role!=="admin";
 app.innerHTML=`<div class="auth-shell"><aside class="auth-art"><a class="brand-logo" href="#" data-home style="color:#fff"><span class="logo-mark">C</span>CollabZone</a><div><span class="eyebrow">Selamat datang di CollabZone</span><h1>Kolaborasi yang tepat dimulai dari sini.</h1><p>Temukan kesempatan, bangun koneksi, dan kelola campaign dengan pengalaman yang lebih mudah.</p></div><div class="small" style="color:#b9b5dc">© 2026 CollabZone</div></aside><main class="auth-main"><div class="auth-box"><button class="auth-back" data-role>← Pilih peran lain</button><h2>${isSignup?"Daftar sebagai":"Masuk sebagai"} ${label}</h2><p>${isSignup?"Buat akun untuk mulai menggunakan CollabZone.":"Masuk untuk melanjutkan ke dashboard."}</p>${role!=="admin"?`<div class="tabs"><button class="${isSignup?"active":""}" data-auth-mode="signup" data-auth-role="${role}">Daftar</button><button class="${!isSignup?"active":""}" data-auth-mode="login" data-auth-role="${role}">Masuk</button></div>`:""}<form id="auth-form" data-role-form="${role}" data-mode="${isSignup?"signup":"login"}">${isSignup?`<div class="form-field"><label>${role==="kol"?"Nama lengkap":"Nama brand"}</label><input name="name" placeholder="${role==="kol"?"Masukkan nama lengkap":"Masukkan nama brand"}" required></div>`:""}<div class="form-field"><label>Email</label><input type="email" name="email" placeholder="nama@email.com" required></div><div class="form-field"><label>Password</label><input type="password" name="password" placeholder="Minimal 8 karakter" minlength="8" required></div><button class="btn btn-primary btn-block" type="submit">${isSignup?"Buat Akun":"Masuk"} →</button></form><p style="margin-top:18px;text-align:center">${firebaseConfigured?"Akun diamankan oleh Firebase Authentication.":"Mode demo lokal aktif; konfigurasi Firebase untuk mengaktifkan autentikasi online."}</p></div></main></div>`;
}
function dashboardShell(content){
 const role=currentUser.role, isBrand=role==="brand", name=currentUser.name||currentUser.email;
 const nav=role==="admin"
  ?[["admin","◉","Ringkasan"],["admin-users","♙","Pengguna"],["admin-campaigns","▦","Semua Campaign"],["admin-applications","♧","Semua Pengajuan"],["admin-verification","✓","Verifikasi KOL"],["admin-topups","＄","Top Up Saldo"],["admin-programs","✦","Program Campaign"]]
  :[["home","⌂","Beranda"],["campaigns","▦",isBrand?"Campaign Saya":"Campaign"],["applications","♧",isBrand?"KOL Listing":"Pengajuan"],["profile","◉","Profil"]];
 app.innerHTML=`<div class="dashboard"><aside class="sidebar"><a class="brand-logo" href="#" data-home><span class="logo-mark">C</span>CollabZone</a><div><div class="side-label">Menu utama</div><nav class="side-nav">${nav.map(([key,ico,label])=>`<button class="${activePage===key?"active":""}" data-page="${key}"><span class="nav-ico">${ico}</span>${label}${key==="notifications"&&unreadCount()>0?`<span class="badge badge-orange" style="margin-left:auto">${unreadCount()}</span>`:""}</button>`).join("")}</nav></div><div class="sidebar-bottom"><b>✦ Tips CollabZone</b><br>${isBrand?"Lengkapi detail campaign agar KOL memahami kebutuhan kontenmu.":"Baca syarat campaign sebelum mengirim pengajuan."}</div><button class="btn btn-ghost" data-logout style="justify-content:flex-start">↪ Keluar</button></aside><section class="main-area"><header class="dash-topbar"><a class="brand-logo" href="#" data-home style="font-size:16px"><span class="logo-mark">C</span>CollabZone</a><div class="topbar-right">${isBrand?`<button class="btn btn-primary" data-topup>＋ Top Up Saldo</button>`:""}<button class="btn btn-ghost notification-button" data-page="notifications" title="Notifikasi" aria-label="Buka notifikasi"><svg class="notification-bell-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-7-3-9"></path><path d="M10 21h4"></path></svg>${unreadCount()?`<span class="badge badge-orange notification-count">${unreadCount()}</span>`:""}</button><div class="profile-menu"><button class="profile-mini profile-menu-toggle" type="button" data-profile-toggle aria-expanded="false" aria-haspopup="true" aria-label="Menu akun ${esc(name)}"><span class="avatar">${avatarContent(name,currentUser.photoData)}</span><span class="profile-name">${esc(name)}</span><span class="profile-chevron" aria-hidden="true">⌄</span></button><div class="profile-dropdown hidden" role="menu"><div class="profile-dropdown-heading"><b>${esc(name)}</b><span>${esc(currentUser.email)}</span></div>${role!=="admin"?`<button type="button" class="profile-dropdown-item" data-page="profile" role="menuitem">Profil saya</button>`:""}<button type="button" class="profile-dropdown-item profile-logout" data-logout role="menuitem">↪ Keluar akun</button></div></div></div></header><main class="dash-content">${content}</main></section></div>${chatWidgetMarkup()}`;
 mountNotificationDropdown();
}
function belongsToCurrentUserNotification(notification){
 return currentUser?.role==="admin"
  ?["verification_requested","topup_submitted"].includes(notification.event)
  :notification.recipientUid===currentUser?.uid||notification.to===currentUser?.email;
}
function unreadCount(){return state.notifications.filter(n=>belongsToCurrentUserNotification(n)&&!n.read).length;}
function notificationItems(){
 return state.notifications
  .filter(belongsToCurrentUserNotification)
  .sort((a,b)=>(b.createdAt||0)-(a.createdAt||0))
  .slice(0,8);
}
function notificationMenuMarkup(isOpen=false){
 const notifications=notificationItems();
 return `<div class="notification-menu${isOpen?"":" hidden"}" role="region" aria-label="Notifikasi terbaru"><div class="notification-menu-head"><b>Notifikasi</b>${unreadCount()?`<button type="button" data-mark-read>Tandai dibaca</button>`:""}</div>${notifications.length?`<div class="notification-menu-list">${notifications.map(n=>`<article class="notification-menu-item${n.read?"":" unread"}"><span class="notification-menu-dot"></span><div><p>${esc(n.message)}</p><small>${n.createdAt?new Date(n.createdAt).toLocaleString("id-ID"):"Baru saja"}</small>${currentUser?.role==="admin"&&n.event==="topup_submitted"?`<button type="button" class="notification-action-button" data-page="admin-topups">Periksa pengajuan top up</button>`:""}</div></article>`).join("")}</div>`:`<div class="notification-menu-empty">Belum ada notifikasi.</div>`}</div>`;
}
function mountNotificationDropdown(){
 const button=$(".notification-button");
 if(!button)return;
 const isOpen=button.getAttribute("aria-expanded")==="true";
 button.removeAttribute("data-page");
 button.dataset.notificationToggle="";
 button.setAttribute("aria-expanded",String(isOpen));
 button.setAttribute("aria-haspopup","true");
 let menu=$(".notification-menu");
 if(!menu){
  const wrapper=document.createElement("div");
  wrapper.className="notification-menu-wrap";
  button.parentNode.insertBefore(wrapper,button);
  wrapper.append(button);
  menu=document.createElement("div");
  wrapper.append(menu);
 }
 menu.outerHTML=notificationMenuMarkup(isOpen);
}
function startNotificationUpdates(){
 unsubscribeNotifications?.();
 unsubscribeNotifications=null;
 unsubscribeUserProfile?.();
 unsubscribeUserProfile=null;
 unsubscribeCampaignPrograms?.();
 unsubscribeCampaignPrograms=null;
 unsubscribeTopupRequests?.();
 unsubscribeTopupRequests=null;
 unsubscribeConversations?.();
 unsubscribeMessages?.();
 unsubscribeConversations=null;
 unsubscribeMessages=null;
 if(!firebaseConfigured||!currentUser?.uid)return;
 const uid=currentUser.uid;
 unsubscribeCampaignPrograms=subscribeCampaignProgramsCloud(programs=>{
  if(currentUser?.uid!==uid)return;
  state.specialPrograms=mergeCampaignPrograms(programs);
  if(currentUser.role==="brand"&&$("#create-modal .campaign-type-option[data-special-program]"))showSpecialProgramPicker();
  else if(currentUser.role==="admin"&&activePage.startsWith("admin"))renderDashboard();
 },error=>{
  console.error("Failed to subscribe to campaign programs",error);
  if(currentUser?.uid===uid)toast(`Program campaign belum dapat diperbarui: ${error.message}`);
 });
 unsubscribeNotifications=subscribeNotificationsCloud(uid,notifications=>{
  if(currentUser?.uid!==uid)return;
  state.notifications=[
   ...state.notifications.filter(item=>currentUser.role==="admin"?!["verification_requested","topup_submitted"].includes(item.event):item.recipientUid!==uid),
   ...notifications
  ];
  mountNotificationDropdown();
 },error=>{
  console.error("Failed to subscribe to notifications",error);
  if(currentUser?.uid===uid)toast(`Notifikasi belum dapat diperbarui: ${error.message}`);
 },currentUser.role);
 unsubscribeTopupRequests=subscribeTopupRequestsCloud(uid,currentUser.role,requests=>{
  if(currentUser?.uid!==uid)return;
  state.topupRequests=requests;
  if(currentUser.role==="admin"&&activePage==="admin-topups")renderDashboard();
 },error=>{
  console.error("Failed to subscribe to top up requests",error);
  if(currentUser?.uid===uid)toast(`Pengajuan top up belum dapat diperbarui: ${error.message}`);
 });
 unsubscribeUserProfile=subscribeUserProfileCloud(uid,profile=>{
  if(currentUser?.uid!==uid)return;
  const previousStatus=currentUser.verificationStatus||"not_requested";
  const previousInstagramStatus=currentUser.instagramVerificationStatus||"";
  const previousTiktokStatus=currentUser.tiktokVerificationStatus||"";
  const previousBalance=Number(currentUser.balance)||0;
  Object.assign(currentUser,{
   balance:profile.balance||0,
   instagram:profile.instagram||"",
   tiktok:profile.tiktok||"",
   whatsapp:profile.whatsapp||"",
   photoData:profile.photoData||"",
   verificationStatus:profile.verificationStatus||"not_requested",
   regularApplicationCompleted:profile.regularApplicationCompleted===true,
   instagramVerificationStatus:profile.instagramVerificationStatus||"",
   tiktokVerificationStatus:profile.tiktokVerificationStatus||""
  });
  const storedUser=state.users.find(user=>user.uid===uid);
  if(storedUser)Object.assign(storedUser,profile);
  if(Number(profile.balance||0)!==previousBalance){
   currentUser.balance=Number(profile.balance)||0;
   if(storedUser)storedUser.balance=currentUser.balance;
   if(currentUser.role==="brand")renderDashboard();
  }
  if(previousStatus!==currentUser.verificationStatus
   ||previousInstagramStatus!==currentUser.instagramVerificationStatus
   ||previousTiktokStatus!==currentUser.tiktokVerificationStatus)renderDashboard();
 },error=>{
  console.error("Failed to subscribe to user profile",error);
  if(currentUser?.uid===uid)toast(`Status profil belum dapat diperbarui: ${error.message}`);
 });
 startChatUpdates();
}
function myCampaigns(){return state.campaigns.filter(c=>c.ownerUid===currentUser.uid||c.ownerEmail===currentUser.email);}
function myApplications(){return state.campaigns.flatMap(c=>(c.applicants||[]).filter(a=>a.email===currentUser.email).map(a=>({...a,campaign:c})));}
function verificationBadge(status){
 const labels={approved:"Profil disetujui admin",pending:"Menunggu persetujuan",rejected:"Pengajuan ditolak",not_requested:"Belum diajukan"};
 const classes={approved:"badge-green",pending:"badge-orange",rejected:"badge-orange",not_requested:"badge-regular"};
 return `<span class="badge ${classes[status]||classes.not_requested}">${labels[status]||labels.not_requested}</span>`;
}
function kolVerificationProgressCard(){
 const {steps,completed,percent}=kolVerificationProgress();
 const labels=["Foto profil","Nama lengkap","Link Instagram atau TikTok","Ajukan campaign Regular 1x","Disetujui admin"];
 return `<section class="panel kol-verification-progress"><div class="section-bar"><div><h2>Progress verifikasi</h2><p>${completed}/5 tahap · ${percent}% selesai</p></div><span class="badge ${percent===100?"badge-green":"badge-regular"}">${percent===100?"Terverifikasi":"Dalam proses"}</span></div><div class="progress"><span style="width:${percent}%"></span></div><ol class="verification-steps">${labels.map((label,index)=>`<li class="${steps[index]?"complete":""}"><span>${steps[index]?"✓":index+1}</span>${label}</li>`).join("")}</ol>${currentUser.verificationStatus==="pending"?`<p class="small muted">Tautan sosial sedang ditinjau admin. Pengajuan campaign Regular tetap dapat dilakukan; Spesial terbuka setelah semua 5 tahap selesai.</p>`:!kolProfileComplete()?`<p class="small muted">Lengkapi foto, nama, dan minimal satu tautan sosial untuk menyelesaikan profil. Link sosial yang sudah disimpan dapat dikonfirmasikan kepada admin secara terpisah.</p>`:!kolProfileApproved()?`<p class="small muted">Konfirmasikan tautan Instagram atau TikTok dari halaman profil dan tunggu persetujuan admin.</p>`:!hasRegularApplication()?`<p class="small muted">Ajukan satu campaign Regular untuk menyelesaikan tahap 4. Persetujuan admin tetap diperlukan pada tahap 5 untuk membuka campaign Spesial.</p>`:""}</section>`;
}
function homePage(){
 const isBrand=currentUser.role==="brand", campaigns=isBrand?myCampaigns():state.campaigns;
 const applied=myApplications().length, n=campaigns.length;
 let content=`<div class="welcome-row"><div><h1>Halo, ${esc(currentUser.name||"teman")}! 👋</h1><p>${isBrand?"Kelola campaign dan temukan kolaborator terbaik.":"Temukan campaign yang cocok untukmu dan mulai berkolaborasi."}</p></div>${isBrand?`<button class="btn btn-primary" data-create>＋ Buat Campaign</button>`:""}</div>${!isBrand?kolVerificationProgressCard():""}<div class="stat-grid"><div class="stat"><div class="stat-top"><span>${isBrand?"Campaign dibuat":"Campaign tersedia"}</span><span class="stat-bubble">▦</span></div><div class="stat-number">${n}</div></div><div class="stat"><div class="stat-top"><span>${isBrand?"Total pengajuan":"Pengajuan saya"}</span><span class="stat-bubble">♧</span></div><div class="stat-number">${isBrand?campaigns.reduce((a,c)=>a+applicantCount(c),0):applied}</div></div><div class="stat"><div class="stat-top"><span>${isBrand?"Saldo campaign":"Campaign terbuka"}</span><span class="stat-bubble">✦</span></div><div class="stat-number">${isBrand?rupiah(currentUser.balance||0):state.campaigns.filter(c=>remaining(c)>0).length}</div></div></div><div class="section-bar"><div><h2>${isBrand?"Campaign Saya":"Campaign Aktif"}</h2><p>${isBrand?"Campaign yang kamu buat akan ditampilkan di sini.":"Pilih campaign sesuai minat dan platformmu."}</p></div>${!isBrand?`<button class="btn btn-outline" data-page="campaigns">Lihat Semua →</button>`:""}</div>`;
 content+=campaigns.length?`<div class="campaign-grid">${campaigns.map(c=>campaignCard(c,isBrand?"brand":"kol")).join("")}</div>`:`<div class="empty-state"><div class="empty-icon">✦</div><h3>${isBrand?"Belum ada campaign":"Belum ada campaign aktif"}</h3><p>${isBrand?"Campaign yang kamu buat akan muncul di sini.":"Campaign dari brand akan muncul di sini saat tersedia."}</p>${isBrand?`<button class="btn btn-primary" data-create>Buat Campaign Pertama</button>`:`<button class="btn btn-outline" data-page="campaigns">Jelajahi Campaign</button>`}</div>`;
 dashboardShell(content);
}
function campaignsPage(){
 const isBrand=currentUser.role==="brand";let campaigns=isBrand?myCampaigns():state.campaigns.filter(c=>remaining(c)>0);
 const content=`<div class="welcome-row"><div><h1>${isBrand?"Campaign Saya":"Jelajahi Campaign"}</h1><p>${isBrand?"Kelola campaign yang sudah dibuat.":"Cari peluang kolaborasi yang cocok denganmu."}</p></div>${isBrand?`<button class="btn btn-primary" data-create>＋ Buat Campaign</button>`:""}</div>${!isBrand?`${kolVerificationProgressCard()}<div class="form-field" style="max-width:400px"><input id="campaign-search" placeholder="Cari nama campaign atau brand..."></div>`:""}<div id="campaign-results" class="campaign-grid">${campaigns.length?campaigns.map(c=>campaignCard(c,isBrand?"brand":"kol")).join(""):`<div class="empty-state" style="grid-column:1/-1"><h3>Belum ada campaign</h3><p>Campaign akan muncul di sini saat tersedia.</p></div>`}</div>`;
 dashboardShell(content);
}
const applicationCategories=[
 {id:"pending",label:"Belum ACC",statuses:["Menunggu","Ditolak"]},
 {id:"accepted",label:"ACC",statuses:["Diterima"]},
 {id:"shipping",label:"Product Shipping",statuses:["Product Shipping"]},
 {id:"draft",label:"Draft Video",statuses:["Draft Video"]},
 {id:"payment",label:"Payment",statuses:["Payment"]}
];
function applicationNextAction(status){
 if(status==="Diterima")return {label:"Mulai Product Shipping",nextStatus:"Product Shipping"};
 if(status==="Product Shipping")return {label:"Konfirmasi produk diterima",nextStatus:"Draft Video"};
 if(status==="Draft Video")return {label:"Konfirmasi draft video selesai",nextStatus:"Payment"};
 return null;
}
function applicationStatusClass(status){
 if(status==="Ditolak")return "badge-orange";
 if(status==="Menunggu"||!status)return "badge-regular";
 return "badge-green";
}
function applicationProgressMarkup(status){
 const stages=["Belum ACC","ACC","Product Shipping","Draft Video","Payment"];
 const current=status==="Ditolak"?0:Math.max(0,stages.indexOf(status));
 return `<div class="application-progress" aria-label="Progress kolaborasi: ${esc(status||"Belum ACC")}"><div class="application-progress-track">${stages.map((stage,index)=>`<span class="application-progress-step ${index<=current?"complete":""} ${index===current?"current":""}"><i>${index<=current?"✓":index+1}</i><b>${stage}</b></span>`).join("")}</div><div class="application-progress-bar"><span style="width:${current/(stages.length-1)*100}%"></span></div></div>`;
}
function applicationsPage(){
 const isBrand=currentUser.role==="brand";
 if(isBrand){
  const all=myCampaigns().flatMap(c=>(c.applicants||[]).map(a=>({...a,campaign:c})));
  const selectedCategory=applicationCategories.find(category=>category.id===activeApplicationCategory)||applicationCategories[0];
  const filtered=all.filter(application=>selectedCategory.statuses.includes(application.status||"Menunggu"));
  const categoryTabs=`<div class="application-stage-tabs" role="tablist" aria-label="Tahapan pengajuan KOL">${applicationCategories.map(category=>`<button type="button" class="application-stage-tab ${category.id===selectedCategory.id?"active":""}" role="tab" aria-selected="${category.id===selectedCategory.id}" data-application-category="${category.id}">${category.label}<span>${all.filter(application=>category.statuses.includes(application.status||"Menunggu")).length}</span></button>`).join("")}</div>`;
  const applicationRows=filtered.map(a=>{
   const status=a.status||"Menunggu";
   const nextAction=applicationNextAction(status);
   const actions=status==="Menunggu"
    ?`<button class="btn btn-primary" data-review="${esc(a.id)}|${esc(a.campaign.id)}|Diterima">ACC</button> <button class="btn btn-outline" data-review="${esc(a.id)}|${esc(a.campaign.id)}|Ditolak">Tolak</button>`
    :nextAction
     ?`<button class="btn btn-primary" data-review="${esc(a.id)}|${esc(a.campaign.id)}|${esc(nextAction.nextStatus)}">${nextAction.label}</button>`
     :"—";
   return `<tr><td><div class="person-cell"><span class="avatar">${initials(a.name)}</span><span>${esc(a.name)}${a.applicantVerified?` ${verifiedMark()}`:""}</span></div>${a.applicantVerified?`<div class="small muted">KOL terverifikasi</div>`:""}<div class="small muted">${esc(a.email)}</div></td><td>${esc(a.campaign.title)}</td><td>${applicationSocialLinks(a)}</td><td><b>${a.campaign.type==="special"?`${rupiah(campaignCpm(a.campaign))} CPM / 1.000 tayangan`:rupiah(a.fee)}</b></td><td><span class="badge ${applicationStatusClass(status)}">${esc(status)}</span></td><td>${actions}</td></tr>`;
  }).join("");
  const content=`<div class="welcome-row"><div><h1>KOL Listing</h1><p>Pantau pengajuan KOL dan progres kolaborasi setiap tahap.</p></div></div>${categoryTabs}${filtered.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>Nama KOL</th><th>Campaign</th><th>Link Sosial</th><th>Fee Diajukan</th><th>Status</th><th>Aksi</th></tr></thead><tbody>${applicationRows}</tbody></table></div>`:`<div class="empty-state"><div class="empty-icon">♧</div><h3>${all.length?"Belum ada KOL di kategori ini":"Belum ada pengajuan KOL"}</h3><p>${all.length?"Pengajuan akan muncul di kategori ini saat tahap sebelumnya selesai.":"Saat KOL mengajukan campaign, pengajuannya akan tampil di sini."}</p></div>`}`;
  dashboardShell(content);
 }else{
  const all=myApplications();
   const content=`<div class="welcome-row"><div><h1>Pengajuan Saya</h1><p>Lihat status dan progress kolaborasi yang diperbarui oleh brand.</p></div></div>${all.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>Campaign</th><th>Brand</th><th>Fee</th><th>Tanggal</th><th>Status</th><th>Progress Kolaborasi</th></tr></thead><tbody>${all.map(a=>`<tr><td><b>${esc(a.campaign.title)}</b></td><td>${esc(a.campaign.brandName)}</td><td>${a.campaign.type==="special"?`${rupiah(campaignCpm(a.campaign))} CPM / 1.000 tayangan`:rupiah(a.fee)}</td><td>${new Date(a.createdAt).toLocaleDateString("id-ID")}</td><td><span class="badge ${applicationStatusClass(a.status)}">${a.status||"Menunggu"}</span></td><td>${applicationProgressMarkup(a.status||"Menunggu")}</td></tr>`).join("")}</tbody></table></div>`:`<div class="empty-state"><div class="empty-icon">♧</div><h3>Belum ada pengajuan</h3><p>Campaign yang kamu ajukan akan tercatat di sini.</p><button class="btn btn-primary" data-page="campaigns">Cari Campaign</button></div>`}`;
  dashboardShell(content);
 }
}
function chatConversations(){
 return (state.conversations||[]).filter(conversation=>conversation.brandUid===currentUser?.uid||conversation.kolUid===currentUser?.uid);
}
function chatUnreadCount(){
 return chatConversations().reduce((total,conversation)=>total+(conversation[currentUser?.role==="brand"?"unreadForBrand":"unreadForKol"]||0),0);
}
function chatWidgetMarkup(){
 const conversations=chatConversations();
 if(currentUser?.role==="admin"||!conversations.length)return "";
 const selected=conversations.find(item=>item.id===activeConversationId)||conversations[0];
 if(selected)activeConversationId=selected.id;
 const messages=selected?(state.chatMessages?.[selected.id]||[]):[];
 return `<div class="chat-widget"><button class="chat-fab" type="button" data-chat-toggle aria-expanded="${chatOpen}">▰${chatUnreadCount()?`<span class="chat-badge">${chatUnreadCount()}</span>`:""}</button>${chatOpen&&selected?`<section class="chat-panel" aria-label="Chat kolaborasi"><header><div><b>${esc(currentUser.role==="brand"?selected.kolName:selected.brandName)}</b><small>${esc(selected.campaignTitle||"Campaign")}</small></div><button type="button" class="chat-close" data-chat-toggle aria-label="Tutup chat">×</button></header>${conversations.length>1?`<select class="chat-select" data-chat-conversation>${conversations.map(item=>`<option value="${esc(item.id)}" ${item.id===selected.id?"selected":""}>${esc(currentUser.role==="brand"?item.kolName:item.brandName)} · ${esc(item.campaignTitle||"Campaign")}</option>`).join("")}</select>`:""}<div class="chat-messages">${messages.length?messages.map(message=>`<div class="chat-message ${message.senderUid===currentUser.uid?"mine":""}"><span>${esc(message.text)}</span><small>${new Date(message.createdAt).toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"})}</small></div>`).join(""):`<p class="chat-empty">Belum ada pesan. Mulai percakapan kolaborasi.</p>`}</div><form id="chat-form" data-chat-id="${esc(selected.id)}"><input name="message" maxlength="1000" placeholder="Tulis pesan..." autocomplete="off" required><button type="submit" aria-label="Kirim pesan">➤</button></form></section>`:""}</div>`;
}
function rerenderChatWidget(){
 const existing=$(".chat-widget");
 if(existing)existing.outerHTML=chatWidgetMarkup();
}
function startChatUpdates(){
 unsubscribeConversations?.();
 unsubscribeMessages?.();
 unsubscribeConversations=null;
 unsubscribeMessages=null;
 activeConversationId=null;
 if(!currentUser||currentUser.role==="admin")return;
 if(!state.conversations)state.conversations=[];
 if(!state.chatMessages)state.chatMessages={};
 if(!firebaseConfigured){
  rerenderChatWidget();
  return;
 }
 const uid=currentUser.uid;
 unsubscribeConversations=subscribeConversationsCloud(uid,currentUser.role,conversations=>{
  if(currentUser?.uid!==uid)return;
  state.conversations=conversations;
  const selected=conversations.find(item=>item.id===activeConversationId)||conversations[0];
  if(selected&&selected.id!==activeConversationId){
   activeConversationId=selected.id;
   unsubscribeMessages?.();
   unsubscribeMessages=subscribeMessagesCloud(selected.id,messages=>{
    if(currentUser?.uid!==uid)return;
    state.chatMessages[selected.id]=messages;
    rerenderChatWidget();
   },error=>toast(`Pesan belum dapat dimuat: ${error.message}`));
   if(chatOpen)markConversationReadCloud(selected.id,currentUser.role).catch(error=>console.error("Failed to mark chat read",error));
  }
  rerenderChatWidget();
 },error=>toast(`Chat belum dapat dimuat: ${error.message}`));
}
function safeUrl(value){try{const u=new URL(value);return ["http:","https:"].includes(u.protocol)?u.href:"#"}catch(e){return "#"}}
function profileSocialUrl(platform,username){
 const raw=String(username||"").trim();
 if(isProfileSocialUrl(platform,raw))return raw;
 const value=raw.replace(/^@/,"");
 if(!value)return "";
 const path=platform==="tiktok"?`@${encodeURIComponent(value)}`:encodeURIComponent(value);
 return `https://www.${platform}.com/${path}`;
}
function isProfileSocialUrl(platform,value){
 try{
  const url=new URL(value);
  const host=url.hostname.toLowerCase().replace(/^www\./,"");
  return url.protocol==="https:"&&(platform==="instagram"
   ?host==="instagram.com"||host.endsWith(".instagram.com")
   :host==="tiktok.com"||host.endsWith(".tiktok.com"));
 }catch{return false;}
}
function applicationSocialLinks(application){
 const links=[
  ["Instagram",application.instagram],
  ["TikTok",application.tiktok]
 ].filter(([,url])=>url);
 if(!links.length&&application.social)links.push(["Profil sosial",application.social]);
 return links.map(([label,url])=>`<a target="_blank" rel="noopener" href="${esc(safeUrl(url))}" style="color:var(--purple);display:block">${label} ↗</a>`).join("")||"—";
}
function notificationsPage(){
 const list=state.notifications.filter(belongsToCurrentUserNotification).sort((a,b)=>b.createdAt-a.createdAt);
 const content=`<div class="welcome-row"><div><h1>Notifikasi</h1><p>Informasi terbaru seputar campaign dan pengajuanmu.</p></div><button class="btn btn-outline" data-mark-read>Tandai sudah dibaca</button></div>${list.length?`<div class="notice-list">${list.map(n=>`<article class="notice"><span class="notice-dot" style="${n.read?"background:#d8d5e9":""}"></span><div><p>${esc(n.message)}</p><small>${new Date(n.createdAt).toLocaleString("id-ID")}</small></div></article>`).join("")}</div>`:`<div class="empty-state"><div class="empty-icon">♢</div><h3>Belum ada notifikasi</h3><p>Notifikasi campaign akan muncul di sini.</p></div>`}`;
 dashboardShell(content);
}
function profilePage(){
 pendingProfilePhoto="";
 profilePhotoRequest++;
 const photoPicker=currentUser.role==="kol"
  ?`<button type="button" class="profile-photo-picker" data-select-profile-photo aria-label="Ganti foto profil"><span class="avatar profile-photo-preview" id="profile-photo-preview">${avatarContent(currentUser.name,currentUser.photoData)}</span><span class="profile-photo-change">Ganti foto</span></button>`
  :`<span class="avatar profile-photo-preview" id="profile-photo-preview">${avatarContent(currentUser.name,currentUser.photoData)}</span>`;
 const photoHint=currentUser.role==="kol"?`<div id="profile-photo-hint" class="small muted">Klik foto untuk mengganti foto profil.</div>`:"";
 const verificationStatus=currentUser.verificationStatus||"not_requested";
 const socialVerificationAction=(field)=>{
  const value=String(currentUser[field]||"");
  const fieldStatus=socialVerificationStatus(field);
  const dirty=$("#profile-form")?.dataset.profileDirty==="true";
  const buttonText=fieldStatus==="pending"?"Menunggu admin":fieldStatus==="approved"?"Disetujui admin":fieldStatus==="rejected"?"Konfirmasi ulang":"Konfirmasi";
  const disabled=!isProfileSocialUrl(field,value)||dirty||["pending","approved"].includes(fieldStatus);
  return `<button class="btn btn-outline${fieldStatus==="approved"?" verification-approved-button":""}" type="button" data-request-verification="${field}" ${disabled?"disabled":""}>${buttonText}</button>`;
 };
 const verificationHelp=verificationStatus==="pending"
  ?`<p id="verification-help" class="small muted">Admin sedang memeriksa tautan yang kamu konfirmasikan. Kamu tetap dapat melihat campaign.</p>`
  :verificationStatus==="approved"
   ?`<p id="verification-help" class="small muted">Tautan sosial disetujui admin. Pastikan foto dan nama lengkap tersedia, lalu ajukan satu campaign Regular untuk menyelesaikan tahap 4.</p>`
   :verificationStatus==="rejected"
    ?`<p id="verification-help" class="small muted">Konfirmasi ditolak. Periksa tautan, simpan perubahan jika perlu, lalu konfirmasikan kembali.</p>`
    :`<p id="verification-help" class="small muted">Simpan link Instagram atau TikTok terlebih dahulu, lalu tekan Konfirmasi untuk meminta pemeriksaan admin. Foto profil melengkapi tahap verifikasi tersendiri.</p>`;
 const profileForm=currentUser.role==="kol"
  ?`<form id="profile-form"><input id="profile-photo-file" name="photoFile" type="file" accept="image/*" class="profile-photo-input"><div class="form-field"><label for="profile-name">Nama lengkap</label><input id="profile-name" name="name" value="${esc(currentUser.name||"")}" maxlength="100" required></div><div class="form-field"><label for="profile-instagram">Link Instagram</label><div class="profile-social-confirm"><input id="profile-instagram" name="instagram" type="url" value="${esc(profileSocialUrl("instagram",currentUser.instagram))}" placeholder="https://www.instagram.com/username" autocomplete="url">${socialVerificationAction("instagram")}</div></div><div class="form-field"><label for="profile-tiktok">Link TikTok</label><div class="profile-social-confirm"><input id="profile-tiktok" name="tiktok" type="url" value="${esc(profileSocialUrl("tiktok",currentUser.tiktok))}" placeholder="https://www.tiktok.com/@username" autocomplete="url">${socialVerificationAction("tiktok")}</div></div><div class="form-field"><label for="profile-whatsapp">Nomor Telepon/WhatsApp (opsional)</label><input id="profile-whatsapp" name="whatsapp" type="tel" value="${esc(currentUser.whatsapp||"")}" placeholder="Contoh: 081234567890" maxlength="20" autocomplete="tel"></div><button class="btn btn-primary" type="submit">Simpan Profil</button></form>${verificationHelp}`
  :currentUser.role==="brand"
   ?`<form id="profile-form"><div class="form-field"><label for="profile-instagram">Instagram</label><input id="profile-instagram" name="instagram" type="text" value="${esc(currentUser.instagram||"")}" placeholder="@username atau link profil"></div><div class="form-field"><label for="profile-tiktok">TikTok</label><input id="profile-tiktok" name="tiktok" type="text" value="${esc(currentUser.tiktok||"")}" placeholder="@username atau link profil"></div><div class="form-field"><label for="profile-whatsapp">Nomor Telepon/WhatsApp</label><input id="profile-whatsapp" name="whatsapp" type="tel" value="${esc(currentUser.whatsapp||"")}" placeholder="Contoh: 081234567890" maxlength="20" autocomplete="tel"></div><button class="btn btn-primary" type="submit">Simpan Profil</button></form><div class="form-field" style="margin-top:15px"><label>Saldo campaign</label><input value="${rupiah(currentUser.balance||0)}" disabled></div>`
   :`<div class="form-field"><label>Saldo campaign</label><input value="${rupiah(currentUser.balance||0)}" disabled></div>`;
 const content=`<div class="welcome-row"><div><h1>Profil Saya</h1><p>Informasi akun CollabZone.</p></div></div>${currentUser.role==="kol"?kolVerificationProgressCard():""}<div class="panel" style="max-width:620px"><div class="person-cell profile-photo-row" style="margin-bottom:24px">${photoPicker}<div><b style="font-size:16px">${esc(currentUser.name)}${currentUser.role==="kol"&&kolVerified()?` ${verifiedMark()}`:""}</b><div class="small muted">${currentUser.role==="brand"?"Brand":"KOL"}${currentUser.role==="kol"&&kolVerified()?" · Terverifikasi":""}</div>${photoHint}</div></div>${currentUser.role==="brand"?`<div class="form-field"><label>Nama brand</label><input value="${esc(currentUser.name)}" disabled></div>`:""}<div class="form-field"><label>Email</label><input value="${esc(currentUser.email)}" disabled></div>${profileForm}<p class="small muted">${firebaseConfigured?"Data akun disimpan di Firebase.":"Ini adalah prototipe lokal. Konfigurasikan Firebase sebelum digunakan secara publik."}</p><button class="btn btn-outline" data-logout>Keluar dari akun</button></div>`;
 dashboardShell(content);
}
function adminPage(){
 const applications=state.applications||state.campaigns.flatMap(c=>(c.applicants||[]).map(a=>({...a,campaignId:c.id,campaignTitle:c.title})));
 const pending=applications.filter(a=>(a.status||"Menunggu")==="Menunggu").length;
 const unread=state.notifications.filter(n=>!n.read).length;
 const tabTitles={
  admin:"Ringkasan Admin",
  "admin-users":"Pengguna",
  "admin-campaigns":"Semua campaign",
  "admin-applications":"Semua pengajuan",
  "admin-verification":"Pengajuan Verifikasi KOL",
  "admin-topups":"Konfirmasi Top Up Saldo",
  "admin-programs":"Program Campaign Spesial"
 };
 if(!tabTitles[activePage])activePage="admin";
 let content=`<div class="welcome-row"><div><h1>${tabTitles[activePage]}</h1><p>Pantau aktivitas pengguna dan seluruh campaign CollabZone.</p></div><button class="btn btn-outline" data-refresh-admin>↻ Perbarui data</button></div><div class="stat-grid admin-stat-grid"><div class="stat"><div class="stat-top"><span>Total pengguna</span><span class="stat-bubble">◉</span></div><div class="stat-number">${state.users.length}</div><div class="small muted">Akun KOL, brand, dan administrator</div></div><div class="stat"><div class="stat-top"><span>Total campaign</span><span class="stat-bubble">▦</span></div><div class="stat-number">${state.campaigns.length}</div><div class="small muted">${state.campaigns.filter(c=>remaining(c)>0).length} masih memiliki slot</div></div><div class="stat"><div class="stat-top"><span>Total pengajuan</span><span class="stat-bubble">♧</span></div><div class="stat-number">${applications.length}</div><div class="small muted">${pending} menunggu review</div></div><div class="stat"><div class="stat-top"><span>Notifikasi belum dibaca</span><span class="stat-bubble">♢</span></div><div class="stat-number">${unread}</div></div></div><section class="admin-panel"><div class="section-bar"><div><h2>Pengguna</h2><p>Daftar akun yang terdaftar.</p></div></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Nama</th><th>Email</th><th>Peran</th><th>Terdaftar</th></tr></thead><tbody>${state.users.length?state.users.map(u=>`<tr><td><b>${esc(u.name||"-")}</b></td><td>${esc(u.email||"-")}</td><td><span class="badge ${u.role==="brand"?"badge-special":u.role==="admin"?"badge-orange":"badge-regular"}">${esc(u.role||"-")}</span></td><td>${u.createdAt?new Date(u.createdAt).toLocaleDateString("id-ID"):"-"}</td></tr>`).join(""):`<tr><td colspan="4">Belum ada data pengguna.</td></tr>`}</tbody></table></div></section><section class="admin-panel"><div class="section-bar"><div><h2>Semua campaign</h2><p>Slot, pemilik, dan minat KOL untuk setiap campaign.</p></div></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Campaign</th><th>Brand</th><th>Tipe</th><th>Pengajuan</th><th>Sisa slot</th><th>Dibuat</th></tr></thead><tbody>${state.campaigns.length?state.campaigns.map(c=>`<tr><td><b>${esc(c.title)}</b></td><td>${esc(c.brandName)}</td><td>${typeBadge(c)}</td><td>${applicantCount(c)}</td><td>${remaining(c)}</td><td>${new Date(c.createdAt).toLocaleDateString("id-ID")}</td></tr>`).join(""):`<tr><td colspan="6">Belum ada campaign.</td></tr>`}</tbody></table></div></section><section class="admin-panel"><div class="section-bar"><div><h2>Semua pengajuan</h2><p>Status dan campaign untuk setiap pengajuan KOL.</p></div></div><div class="table-wrap"><table class="data-table"><thead><tr><th>KOL</th><th>Email</th><th>Campaign</th><th>Fee</th><th>Status</th></tr></thead><tbody>${applications.length?applications.map(a=>`<tr><td><b>${esc(a.name||"-")}</b></td><td>${esc(a.email||"-")}</td><td>${esc(a.campaignTitle||campaignById(a.campaignId)?.title||"-")}</td><td>${rupiah(a.fee)}</td><td><span class="badge ${a.status==="Diterima"?"badge-green":a.status==="Ditolak"?"badge-orange":"badge-regular"}">${esc(a.status||"Menunggu")}</span></td></tr>`).join(""):`<tr><td colspan="5">Belum ada pengajuan.</td></tr>`}</tbody></table></div></section>`;
 content+=`<section class="admin-panel"><div class="section-bar"><div><h2>Syarat Campaign Spesial</h2><p>Admin menentukan syarat dan ketentuan untuk setiap campaign Spesial.</p></div></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Campaign</th><th>Brand</th><th>CPM</th><th>Syarat</th><th>Aksi</th></tr></thead><tbody>${state.campaigns.filter(c=>c.type==="special").length?state.campaigns.filter(c=>c.type==="special").map(c=>`<tr><td><b>${esc(c.title)}</b></td><td>${esc(c.brandName||"-")}</td><td>${rupiah(campaignCpm(c))}</td><td>${c.terms?esc(c.terms.slice(0,100)):"Belum diisi"}</td><td><button class="btn btn-outline" type="button" data-admin-edit-terms="${esc(c.id)}">${c.terms?"Ubah syarat":"Isi syarat"}</button></td></tr>`).join(""):`<tr><td colspan="5">Belum ada campaign Spesial.</td></tr>`}</tbody></table></div></section>`;
 content+=`<section class="admin-panel"><div class="section-bar"><div><h2>Program Campaign Spesial</h2><p>Tambahkan program yang akan tersedia untuk dipilih brand.</p></div></div><form id="campaign-program-form" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:0 12px;align-items:end"><div class="form-field"><label for="campaign-program-name">Nama program</label><input id="campaign-program-name" name="name" maxlength="80" placeholder="Contoh: Kampanye Produk Lokal" required></div><div class="form-field"><label for="campaign-program-description">Deskripsi program</label><input id="campaign-program-description" name="description" maxlength="240" placeholder="Penjelasan singkat yang terlihat saat dipilih"></div><div class="form-field"><button class="btn btn-primary" type="submit">＋ Tambah Program</button></div></form><div class="table-wrap"><table class="data-table"><thead><tr><th>Nama program</th><th>Deskripsi</th></tr></thead><tbody>${state.specialPrograms.map(program=>`<tr><td><b>${esc(program.name)}</b></td><td>${esc(program.description||"-")}</td></tr>`).join("")}</tbody></table></div></section>`;
 const verificationRequests=state.users.flatMap(user=>user.role==="kol"
  ?["instagram","tiktok"].filter(platform=>socialVerificationStatusForUser(user,platform)==="pending")
   .map(platform=>({user,platform}))
  :[]);
 content+=`<section class="admin-panel"><div class="section-bar"><div><h2>Pengajuan Verifikasi KOL</h2><p>Tinjau tiap link Instagram atau TikTok yang menunggu persetujuan.</p></div></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Nama KOL</th><th>Email</th><th>Platform</th><th>Link profil</th><th>Diajukan</th><th>Aksi</th></tr></thead><tbody>${verificationRequests.length?verificationRequests.map(({user,platform})=>`<tr><td><b>${esc(user.name||"-")}</b></td><td>${esc(user.email||"-")}</td><td>${platform==="instagram"?"Instagram":"TikTok"}</td><td>${esc(profileSocialUrl(platform,user[platform])||"-")}</td><td>${user[`${platform}VerificationRequestedAt`]?new Date(user[`${platform}VerificationRequestedAt`]).toLocaleDateString("id-ID"):user.verificationRequestedAt?new Date(user.verificationRequestedAt).toLocaleDateString("id-ID"):"-"}</td><td><div class="profile-actions"><button class="btn btn-primary" data-verification-review="${esc(user.uid||user.id)}|${platform}|approved">Setujui</button><button class="btn btn-outline" data-verification-review="${esc(user.uid||user.id)}|${platform}|rejected">Tolak</button></div></td></tr>`).join(""):`<tr><td colspan="6">Tidak ada tautan yang menunggu konfirmasi.</td></tr>`}</tbody></table></div></section>`;
 const pendingTopups=state.topupRequests.filter(request=>request.status==="pending").length;
 content+=`<section class="admin-panel"><div class="section-bar"><div><h2>Konfirmasi Top Up Saldo</h2><p>${pendingTopups} pengajuan menunggu pemeriksaan bukti pembayaran.</p></div></div><div class="table-wrap"><table class="data-table"><thead><tr><th>ID Pengajuan</th><th>Email</th><th>Metode</th><th>Nominal</th><th>Dikirim</th><th>Status</th><th>Aksi</th></tr></thead><tbody>${state.topupRequests.length?state.topupRequests.slice().sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).map(request=>`<tr><td><b>${esc(request.displayId||`${request.id}-${request.brandName||"Brand"}`)}</b><div class="small muted">${esc(request.brandName||"-")}</div></td><td>${esc(request.email||"-")}</td><td>Transfer bank</td><td>${rupiah(request.amount)}</td><td>${request.createdAt?new Date(request.createdAt).toLocaleString("id-ID"):"-"}</td><td><span class="badge ${request.status==="approved"?"badge-green":request.status==="rejected"?"badge-orange":"badge-regular"}">${request.status==="approved"?"Disetujui":request.status==="rejected"?"Ditolak":"Menunggu"}</span></td><td><button class="btn btn-outline" type="button" data-topup-review="${esc(request.id)}">${request.status==="pending"?"Periksa bukti":"Lihat bukti"}</button></td></tr>`).join(""):`<tr><td colspan="7">Belum ada pengajuan top up.</td></tr>`}</tbody></table></div></section>`;
 const contentRoot=document.createElement("div");
 contentRoot.innerHTML=content;
 const verificationPanel=[...contentRoot.querySelectorAll(".admin-panel")]
  .find(panel=>panel.querySelector("h2")?.textContent.trim()==="Pengajuan Verifikasi KOL");
 verificationPanel?.querySelectorAll("tbody tr").forEach(row=>{
  const cell=row.cells[3];
  const url=cell?.textContent.trim();
  if(!cell||!url||url==="-")return;
  const link=document.createElement("a");
  link.href=safeUrl(url);
  link.target="_blank";
  link.rel="noopener noreferrer";
  link.textContent="Buka profil ↗";
  link.style.color="var(--purple)";
  cell.replaceChildren(link);
 });
 contentRoot.querySelector(".admin-stat-grid")?.classList.toggle("hidden",activePage!=="admin");
 const visibleSection=tabTitles[activePage];
 contentRoot.querySelectorAll(".admin-panel").forEach(panel=>{
  const title=panel.querySelector("h2")?.textContent.trim();
  if(title==="Notifikasi"){panel.remove();return;}
  panel.classList.toggle("hidden",title!==visibleSection&&!(activePage==="admin-programs"&&title==="Syarat Campaign Spesial")||activePage==="admin");
 });
 dashboardShell(contentRoot.innerHTML);
}
function renderDashboard(){if(!currentUser)return landing();if(currentUser.role==="admin"){adminPage();return;}({home:homePage,campaigns:campaignsPage,applications:applicationsPage,notifications:notificationsPage,profile:profilePage}[activePage]||homePage)();}
function showDetail(id){
 const c=campaignById(id);if(!c)return;
 const isBrand=currentUser?.role==="brand";
 const isOwner=isBrand&&(c.ownerUid===currentUser.uid||c.ownerEmail===currentUser.email);
 const overlay=document.createElement("div");overlay.className="modal-backdrop";overlay.id="detail-modal";
 const campaignLocked=currentUser?.role==="kol"&&!canApplyToCampaign(c);
 const applicationAction=`<button class="btn btn-primary" data-apply="${esc(c.id)}" ${remaining(c)===0?"disabled":""}>Saya Tertarik</button>`;
 const profileHelp=campaignLocked
  ?`<p class="small muted" style="margin:0 0 12px">Anda belum verified, jadi belum bisa mendaftar campaign Spesial. Lengkapi semua tahap verifikasi terlebih dahulu.</p><button class="btn btn-outline" type="button" data-complete-kol-profile>Lihat Progress Verifikasi</button>`
  :"";
 overlay.innerHTML=`<div class="modal"><div class="modal-head"><div><div class="muted small">${esc(c.brandName)} · ${typeBadge(c)}${c.type==="special"?` · ${esc(campaignProgramName(c.specialProgram||"umkm"))}`:""}</div><h2 style="margin-top:7px">${esc(c.title)}</h2></div><button class="icon-button" data-close-modal>×</button></div><div class="detail-banner">${c.banner?`<img src="${c.banner}" alt="">`:`<div class="banner-fallback" style="height:100%;font-size:28px">${esc(c.brandName)}</div>`}</div>${feeBlock(c)}<h3>Deskripsi Brand</h3><p>${esc(c.description).replace(/\n/g,"<br>")}</p><h3>Syarat dan Ketentuan</h3><p>${esc(c.terms).replace(/\n/g,"<br>")}</p><div class="campaign-meta"><span>${applicantCount(c)}/${c.slots||5} KOL mendaftar</span><b>Sisa ${remaining(c)} slot</b></div>${profileHelp}<div class="card-actions"><button class="btn btn-outline" data-close-modal>Tutup</button>${isOwner?`<button class="btn btn-outline" data-edit-campaign="${esc(c.id)}">Edit Campaign</button><button class="btn btn-primary" data-applicants="${esc(c.id)}" data-close-first>Lihat Pengajuan</button>`:isBrand?`<button class="btn btn-primary" data-applicants="${esc(c.id)}" data-close-first>Lihat Pengajuan</button>`:applicationAction}</div></div>`;
 document.body.appendChild(overlay);overlay.addEventListener("click",e=>{if(e.target===overlay)overlay.remove();});
}
function showSpecialCampaignVerificationNotice(){
 const existing=$("#verification-required-modal");
 if(existing){existing.focus();return;}
 const overlay=document.createElement("div");
 overlay.className="modal-backdrop verification-required-backdrop";
 overlay.id="verification-required-modal";
 overlay.innerHTML=`<section class="verification-required-dialog" role="alertdialog" aria-modal="true" aria-labelledby="verification-required-title" aria-describedby="verification-required-message" tabindex="-1"><span class="verification-required-icon" aria-hidden="true">!</span><h2 id="verification-required-title">Verifikasi belum lengkap</h2><p id="verification-required-message">Anda belum verified, jadi belum bisa mendaftar campaign Spesial. Selesaikan semua tahap verifikasi terlebih dahulu.</p><div class="verification-required-actions"><button class="btn btn-outline" type="button" data-close-modal>Tutup</button><button class="btn btn-primary" type="button" data-complete-kol-profile>Lihat Progress Verifikasi</button></div></section>`;
 document.body.appendChild(overlay);
 overlay.querySelector(".verification-required-dialog")?.focus();
 overlay.addEventListener("click",event=>{if(event.target===overlay)overlay.remove();});
}
function showApply(id){
 const c=campaignById(id);if(!c)return;
 if(!currentUser){toast("Silakan login sebagai KOL terlebih dahulu.");return;}
 if(currentUser.role!=="kol"){toast("Hanya akun KOL yang dapat mengajukan campaign.");return;}
 if(c.type==="special"&&!kolVerified()){showSpecialCampaignVerificationNotice();return;}
 if(remaining(c)<=0){toast("Maaf, slot campaign sudah penuh.");return;}
 if((c.applicants||[]).some(a=>a.email===currentUser.email)){toast("Kamu sudah mengajukan campaign ini.");return;}
 applicantCampaignId=id;
 const overlay=document.createElement("div");overlay.className="modal-backdrop";overlay.id="apply-modal";
 overlay.innerHTML=`<div class="modal"><div class="modal-head"><div><div class="muted small">Form pengajuan</div><h2 style="margin-top:7px">${esc(c.title)}</h2></div><button class="icon-button" data-close-modal>×</button></div><p class="muted" style="font-size:13px;margin-top:-8px">${c.type==="regular"?"Campaign Regular dapat diajukan meskipun profil belum lengkap. Kamu bisa melengkapi profil untuk melanjutkan verifikasi.":"Data profil terverifikasi akan digunakan pada pengajuan ini."}${c.type==="regular"&&!hasRegularApplication()?" Pengajuan ini menjadi tahap terakhir verifikasi setelah syarat profil dan persetujuan sosial terpenuhi.":""}</p><form id="apply-form"><div class="form-field"><label>Nama lengkap</label><input name="name" value="${esc(currentUser.name||"")}" readonly ${c.type==="special"?"required":""}></div><div class="form-field"><label>Link Instagram</label><input name="instagram" type="url" value="${esc(profileSocialUrl("instagram",currentUser.instagram))}" readonly></div><div class="form-field"><label>Link TikTok</label><input name="tiktok" type="url" value="${esc(profileSocialUrl("tiktok",currentUser.tiktok))}" readonly></div>${c.type==="regular"?`<div class="form-field"><label>Pengajuan fee (Rupiah)</label><input name="fee" type="text" inputmode="numeric" data-rupiah-input placeholder="Contoh: 250.000" required></div>`:`<div class="fee-box"><div class="fee-label">${c.cpm!==undefined||!Number(c.videoCount)?"CPM (Cost Per Mille)":"Fee yang ditetapkan brand"}</div><div class="fee-value">${c.cpm!==undefined||!Number(c.videoCount)?`${rupiah(campaignCpm(c))} / 1.000 tayangan`:`${rupiah(c.fee)} / ${c.videoCount} video`}</div><div class="fee-sub">${c.cpm!==undefined||!Number(c.videoCount)?"Biaya per seribu tayangan.":"Pengajuan mengikuti paket yang ditawarkan brand."}</div></div>`}<button class="btn btn-primary btn-block" type="submit">Kirim Pengajuan →</button></form></div>`;
 document.body.appendChild(overlay);overlay.addEventListener("click",e=>{if(e.target===overlay)overlay.remove();});
}
function showCampaignTypePicker(){
 if(currentUser?.role!=="brand")return;
 if(!firebaseConfigured){toast("Top up dan konfirmasi saldo memerlukan Firebase aktif.");return;}
 if(Number(currentUser.balance||0)<CAMPAIGN_CREATION_COST){showTopup();return;}
 bannerUploadRequest++;
 bannerUploadInProgress=false;
 uploadedBanner="";
 $("#create-modal")?.remove();
 const overlay=document.createElement("div");overlay.className="modal-backdrop";overlay.id="create-modal";
 overlay.innerHTML=`<div class="modal campaign-type-picker"><div class="modal-head"><div><div class="muted small">Campaign baru</div><h2 style="margin-top:6px">Pilih Jenis Campaign</h2></div><button class="icon-button" type="button" data-close-modal aria-label="Tutup">×</button></div><p class="muted campaign-type-intro">Biaya pembuatan setiap campaign adalah ${rupiah(CAMPAIGN_CREATION_COST)} dan akan dipotong dari saldo setelah top up disetujui admin.</p><div class="campaign-type-options"><button type="button" class="campaign-type-option" data-create-type="regular"><span class="campaign-type-option-icon">◉</span><span><b>Campaign Regular</b><small>KOL mengajukan fee sendiri saat mendaftar.</small></span><span class="campaign-type-arrow">→</span></button><button type="button" class="campaign-type-option" data-create-type="special"><span class="campaign-type-option-icon">✦</span><span><b>Campaign Spesial</b><small>Tentukan fee dan jumlah video untuk KOL.</small></span><span class="campaign-type-arrow">→</span></button></div></div>`;
 document.body.appendChild(overlay);
}
function showSpecialProgramPicker(){
 if(currentUser?.role!=="brand")return;
 $("#create-modal")?.remove();
 const overlay=document.createElement("div");overlay.className="modal-backdrop";overlay.id="create-modal";
 overlay.innerHTML=`<div class="modal campaign-type-picker"><div class="modal-head"><div><button class="campaign-form-back" type="button" data-choose-campaign-type>← Ganti jenis campaign</button><div class="muted small">Campaign baru · Campaign Spesial</div><h2 style="margin-top:6px">Pilih Program Campaign</h2></div><button class="icon-button" type="button" data-close-modal aria-label="Tutup">×</button></div><p class="muted campaign-type-intro">Pilih program yang ingin digunakan sebelum mengisi form campaign.</p><div class="campaign-type-options">${state.specialPrograms.map(program=>`<button type="button" class="campaign-type-option" data-special-program="${esc(program.id)}"><span class="campaign-type-option-icon">${program.id==="umkm"?"♡":"✦"}</span><span><b>${esc(program.name)}</b><small>${esc(program.description||"Campaign spesial dari CollabZone.")}</small></span><span class="campaign-type-arrow">→</span></button>`).join("")}</div></div>`;
 document.body.appendChild(overlay);
}
function showCreate(type,campaign=null,specialProgram="umkm"){
 if(currentUser?.role!=="brand"||!["regular","special"].includes(type))return;
 if(!firebaseConfigured){toast("Pembuatan campaign berbayar memerlukan Firebase aktif.");return;}
 if(!campaign&&Number(currentUser.balance||0)<CAMPAIGN_CREATION_COST){showTopup();return;}
 bannerUploadRequest++;
 bannerUploadInProgress=false;
 uploadedBanner=campaign?.banner||"";
 $("#create-modal")?.remove();
 const isSpecial=type==="special";
 const overlay=document.createElement("div");overlay.className="modal-backdrop";overlay.id="create-modal";
 const preview=campaign?.banner?`<div id="banner-preview" class="banner-upload-preview"><img id="banner-preview-image" src="${esc(campaign.banner)}" alt="Pratinjau banner campaign"><div class="banner-upload-info"><span id="banner-preview-status" class="small">Banner saat ini</span><div id="banner-upload-progress" class="banner-upload-progress hidden" role="status"><span class="banner-upload-spinner" aria-hidden="true"></span><span class="banner-upload-track"><span id="banner-upload-progress-bar" class="banner-upload-progress-bar"></span></span><span id="banner-upload-progress-text" class="banner-upload-progress-text">0%</span></div></div></div>`:`<div id="banner-preview" class="banner-upload-preview hidden"><img id="banner-preview-image" alt="Pratinjau banner campaign"><div class="banner-upload-info"><span id="banner-preview-status" class="small"></span><div id="banner-upload-progress" class="banner-upload-progress hidden" role="status"><span class="banner-upload-spinner" aria-hidden="true"></span><span class="banner-upload-track"><span id="banner-upload-progress-bar" class="banner-upload-progress-bar"></span></span><span id="banner-upload-progress-text" class="banner-upload-progress-text">0%</span></div></div></div>`;
 const selectedProgram=campaign?.specialProgram||specialProgram;
 const formNavigation=campaign?"":`${isSpecial?`<button class="campaign-form-back" type="button" data-choose-special-program>← Ganti program</button>`:""}<button class="campaign-form-back" type="button" data-choose-campaign-type>← Ganti jenis campaign</button>`;
 overlay.innerHTML=`<div class="modal"><div class="modal-head"><div>${formNavigation}<div class="muted small">${campaign?"Edit campaign":"Campaign baru"} · ${isSpecial?`Campaign Spesial · ${esc(campaignProgramName(selectedProgram))}`:"Campaign Regular"}</div><h2 style="margin-top:6px">${campaign?"Edit Campaign":"Buat Campaign"}</h2></div><button class="icon-button" type="button" data-close-modal aria-label="Tutup">×</button></div><form id="create-form"><input type="hidden" name="type" value="${type}"><input type="hidden" name="campaignId" value="${esc(campaign?.id||"")}"><input type="hidden" name="specialProgram" value="${isSpecial?esc(selectedProgram):""}"><div class="form-field"><label>Banner campaign (gambar)</label><div class="upload-box">Pilih gambar untuk banner campaign<br> <input type="file" name="banner" accept=".jpg,.jpeg,.png,image/jpeg,image/png" id="banner-file"><div class="upload-hint">Format JPG atau PNG, maksimal 2 MB. Gambar akan dikompres dan disimpan di Firestore, tanpa Firebase Storage.</div>${preview}</div></div><div class="form-field"><label>Nama campaign</label><input name="title" value="${esc(campaign?.title||"")}" placeholder="Contoh: #GlowWithSkinGlow" required></div><div class="form-field"><label>Deskripsi brand</label><textarea name="description" placeholder="Ceritakan campaign dan konten yang dibutuhkan..." required>${esc(campaign?.description||"")}</textarea></div>${isSpecial?`<div class="notice notice-info">Syarat dan ketentuan campaign Spesial akan ditentukan dan diisi oleh admin.</div><div class="form-field"><label>CPM (Cost Per Mille) · Rupiah per 1.000 tayangan</label><input name="cpm" type="text" inputmode="numeric" data-rupiah-input value="${campaign?new Intl.NumberFormat("id-ID").format(campaignCpm(campaign)||0):""}" placeholder="150.000" required></div><p class="small muted">Nilai CPM akan ditampilkan kepada KOL sebagai biaya per seribu tayangan.</p>`:`<div class="form-field"><label>Syarat dan ketentuan</label><textarea name="terms" placeholder="Tuliskan syarat, deliverables, dan ketentuan campaign..." required>${esc(campaign?.terms||"")}</textarea><div class="form-field"><label>Sistem fee</label><input value="KOL menentukan fee saat mengajukan" disabled></div></div>`}<button class="btn btn-primary btn-block" type="submit">${campaign?"Simpan Perubahan":"Simpan Campaign"} →</button></form></div>`;
 document.body.appendChild(overlay);
}
function showAdminCampaignTerms(campaign){
 if(currentUser?.role!=="admin"||campaign?.type!=="special")return;
 $("#admin-terms-modal")?.remove();
 const overlay=document.createElement("div");
 overlay.className="modal-backdrop";
 overlay.id="admin-terms-modal";
 overlay.innerHTML=`<div class="modal"><div class="modal-head"><div><div class="muted small">Campaign Spesial · ${esc(campaign.title)}</div><h2 style="margin-top:6px">Atur Syarat Campaign</h2></div><button class="icon-button" type="button" data-close-modal aria-label="Tutup">×</button></div><form id="admin-campaign-terms-form"><input type="hidden" name="campaignId" value="${esc(campaign.id)}"><div class="form-field"><label>Syarat dan ketentuan untuk KOL</label><textarea name="terms" rows="8" placeholder="Tuliskan syarat, deliverables, dan ketentuan campaign..." required>${esc(campaign.terms||"")}</textarea></div><button class="btn btn-primary btn-block" type="submit">Simpan Syarat →</button></form></div>`;
 document.body.appendChild(overlay);
}
function validateBannerFile(file){
 const extension=file.name.split(".").pop()?.toLowerCase();
 const allowedType=(extension==="jpg"||extension==="jpeg")&&file.type==="image/jpeg"
  ||extension==="png"&&file.type==="image/png";
 if(!allowedType)return "format";
 if(file.size>2*1024*1024)return "size";
 return "";
}
async function compressBannerToDataUrl(file,onProgress=()=>{}){
 const bitmap=await createImageBitmap(file);
 try{
  const maxDimension=1280;
  const scale=Math.min(1,maxDimension/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement("canvas");
  canvas.width=Math.max(1,Math.round(bitmap.width*scale));
  canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const context=canvas.getContext("2d");
  if(!context)throw new Error("Browser tidak dapat memproses gambar banner.");
  context.fillStyle="#ffffff";
  context.fillRect(0,0,canvas.width,canvas.height);
  context.drawImage(bitmap,0,0,canvas.width,canvas.height);
  const maxOutputBytes=350*1024;
  const qualities=[0.86,0.76,0.66,0.56,0.46];
  for(let index=0;index<qualities.length;index++){
   const quality=qualities[index];
   const blob=await new Promise((resolve,reject)=>canvas.toBlob(result=>{
    if(result)resolve(result);
    else reject(new Error("Gagal mengompres gambar banner."));
   },"image/jpeg",quality));
   onProgress(Math.min(90,15+(index+1)*15));
   if(blob.size<=maxOutputBytes){
    const dataUrl=await new Promise((resolve,reject)=>{
     const reader=new FileReader();
     reader.onload=()=>resolve(reader.result);
     reader.onerror=()=>reject(new Error("Gagal membaca gambar banner yang sudah dikompres."));
     reader.readAsDataURL(blob);
    });
    onProgress(100);
    return dataUrl;
   }
  }
  throw new Error("Gambar banner tidak dapat diperkecil hingga batas penyimpanan. Coba gambar yang lebih sederhana.");
 }finally{
  bitmap.close();
 }
}
function showApplicants(id){
 const c=campaignById(id);if(!c)return;
 const list=c.applicants||[];
 const overlay=document.createElement("div");overlay.className="modal-backdrop";overlay.id="applicants-modal";
 overlay.innerHTML=`<div class="modal"><div class="modal-head"><div><div class="muted small">Pengajuan campaign</div><h2 style="margin-top:6px">${esc(c.title)}</h2></div><button class="icon-button" data-close-modal>×</button></div>${list.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>KOL</th><th>Link sosial</th><th>Fee</th><th>Status</th></tr></thead><tbody>${list.map(a=>`<tr><td><b>${esc(a.name)}${a.applicantVerified?` ${verifiedMark()}`:""}</b><div class="small muted">${esc(a.email)}</div></td><td>${applicationSocialLinks(a)}</td><td>${c.type==="special"?(c.cpm!==undefined||!Number(c.videoCount)?`${rupiah(campaignCpm(c))} CPM / 1.000 tayangan`:`${rupiah(c.fee)} / ${c.videoCount} video`):rupiah(a.fee)}</td><td>${esc(a.status||"Menunggu")}</td></tr>`).join("")}</tbody></table></div>`:`<div class="empty-state"><h3>Belum ada pengajuan</h3><p>Pengajuan KOL akan muncul di sini.</p></div>`}</div>`;
 document.body.appendChild(overlay);
}
async function showTopupReviewModal(requestId){
 const request=state.topupRequests.find(item=>item.id===requestId);
 if(!request){toast("Pengajuan top up tidak ditemukan.");return;}
 let receiptUrl=request.receiptData||"";
 try{
  if(request.receiptPath){
   receiptUrl=await getTopupReceiptUrlCloud(request.receiptPath);
  }else if(!receiptUrl){
   receiptUrl=await getTopupReceiptCloud(request.id);
  }
 }catch(error){
  console.error("Failed to load top up receipt",error);
  toast(`Bukti pembayaran tidak dapat dimuat: ${error.message}`);
  return;
 }
 $("#topup-review-modal")?.remove();
 const overlay=document.createElement("div");overlay.className="modal-backdrop";overlay.id="topup-review-modal";
 const canReview=currentUser?.role==="admin"&&request.status==="pending";
 overlay.innerHTML=`<div class="modal"><div class="modal-head"><div><div class="muted small">Bukti transfer bank · ${esc(request.displayId||request.id)}</div><h2 style="margin-top:6px">${esc(request.brandName||"Brand")}</h2></div><button class="icon-button" type="button" data-close-modal aria-label="Tutup">×</button></div><p class="small muted">${esc(request.email||"")} · ${rupiah(request.amount)} · ${request.createdAt?new Date(request.createdAt).toLocaleString("id-ID"):""}</p>${receiptUrl?`<img class="topup-review-image" src="${esc(receiptUrl)}" alt="Bukti pembayaran JPG dari ${esc(request.brandName||"brand")}">`:`<div class="empty-state"><h3>Bukti pembayaran tidak tersedia</h3></div>`}<p class="small muted">Status: <b>${request.status==="approved"?"Disetujui":request.status==="rejected"?"Ditolak":"Menunggu pemeriksaan"}</b></p>${canReview?`<div class="card-actions"><button class="btn btn-outline" type="button" data-review-topup-status="${esc(request.id)}|rejected">Tolak</button><button class="btn btn-primary" type="button" data-review-topup-status="${esc(request.id)}|approved">Konfirmasi Pembayaran & Tambah Saldo</button></div>`:""}</div>`;
 document.body.appendChild(overlay);
}
function addNotification(to,message,recipientUid,applicationId,event){
 const isCampaignEvent=event==="campaign_created";
 const notification={id:"n"+Date.now()+Math.random().toString(16).slice(2,6),to,recipientUid,senderUid:currentUser?.uid||null,applicationId:isCampaignEvent?null:applicationId,campaignId:isCampaignEvent?applicationId:null,event,message,createdAt:Date.now(),read:false};
 state.notifications.push(notification);
 return notification;
}
async function logout(){
 try{
  unsubscribeNotifications?.();unsubscribeNotifications=null;
  unsubscribeUserProfile?.();unsubscribeUserProfile=null;
  unsubscribeTopupRequests?.();unsubscribeTopupRequests=null;
  unsubscribeConversations?.();unsubscribeConversations=null;
  unsubscribeMessages?.();unsubscribeMessages=null;
  activeConversationId=null;chatOpen=false;
  if(firebaseConfigured)await signOutAccount();
  currentUser=null;activePage="home";landing();toast("Kamu sudah keluar.");
 }catch(error){console.error(error);toast(`Gagal keluar: ${error.message}`);}
}
function showTopup(){
 if(currentUser?.role!=="brand")return;
 if(!firebaseConfigured){toast("Pengajuan pembayaran memerlukan Firebase aktif agar admin dapat memeriksa bukti.");return;}
 const pendingRequest=state.topupRequests.find(request=>request.status==="pending");
 uploadedTopupProof="";
 topupProofProcessing=false;
 topupProofRequest++;
 $("#topup-modal")?.remove();
 const overlay=document.createElement("div");overlay.className="modal-backdrop";overlay.id="topup-modal";
 overlay.innerHTML=`<div class="modal topup-modal"><div class="modal-head"><div><div class="muted small">Paket saldo campaign</div><h2 style="margin-top:6px">Top Up Saldo</h2></div><button class="icon-button" type="button" data-close-modal aria-label="Tutup">×</button></div><div class="topup-package"><span class="topup-package-label">Saldo untuk 1 campaign</span><strong>${rupiah(CAMPAIGN_CREATION_COST)}</strong><span class="small muted">Saldo masuk setelah bukti pembayaran disetujui admin.</span></div>${pendingRequest?`<div class="topup-pending-notice"><b>Bukti pembayaran sedang diperiksa admin.</b><span>ID pengajuan: ${esc(pendingRequest.displayId||`${pendingRequest.id}-${pendingRequest.brandName||currentUser.name}`)}</span><span>Saldo akan ditambahkan setelah pembayaran dikonfirmasi.</span></div>`:`<div class="topup-payment-instructions">Metode pembayaran: <b>Transfer bank BNI</b><div class="topup-bank-account"><span>Nomor rekening</span><strong>40254652</strong></div><span>Transfer tepat sebesar ${rupiah(CAMPAIGN_CREATION_COST)}, lalu unggah bukti pembayaran.</span></div><form id="topup-form" class="topup-form"><div class="form-field"><label>Metode pembayaran</label><input value="Transfer bank BNI" disabled></div><div class="form-field"><label for="topup-proof">Bukti transfer (JPG)</label><input id="topup-proof" name="proof" type="file" accept=".jpg,.jpeg,image/jpeg" required><span class="small muted">Format JPG/JPEG, maksimal 5 MB.</span><div id="topup-proof-preview" class="topup-proof-preview hidden"></div></div><button class="btn btn-primary btn-block" type="submit">Kirim Bukti Pembayaran →</button></form>`}<p class="small muted topup-balance">Saldo saat ini: <b>${rupiah(currentUser.balance||0)}</b></p></div>`;
 document.body.appendChild(overlay);
}
function showTopupSubmitted(request){
 $("#topup-modal")?.remove();
 const overlay=document.createElement("div");overlay.className="modal-backdrop";overlay.id="topup-submitted-modal";
 const message=`Halo Admin, saya ${currentUser.name} sudah mengirim bukti transfer bank sebesar ${rupiah(CAMPAIGN_CREATION_COST)}. ID pengajuan: ${request.displayId||request.id}. Mohon konfirmasi jika pembayaran sudah diterima.`;
 overlay.innerHTML=`<div class="modal"><div class="modal-head"><div><div class="muted small">Bukti pembayaran terkirim</div><h2 style="margin-top:6px">Menunggu Konfirmasi Admin</h2></div><button class="icon-button" type="button" data-close-modal aria-label="Tutup">×</button></div><p class="muted">Admin akan memeriksa bukti pembayaran. Saldo baru ditambahkan setelah pengajuan disetujui.</p><div class="topup-pending-notice"><b>Nomor pengajuan</b><span>${esc(request.displayId||request.id)}</span></div><a class="btn btn-primary btn-block" href="${ADMIN_WHATSAPP_URL}?text=${encodeURIComponent(message)}" target="_blank" rel="noopener noreferrer">Chat Admin via WhatsApp</a></div>`;
 document.body.appendChild(overlay);
}
function updateCurrentUserBalance(balance){
 currentUser.balance=balance;
 const storedUser=state.users.find(user=>currentUser.uid?user.uid===currentUser.uid:user.id===currentUser.id);
 if(storedUser)storedUser.balance=balance;
 save();
}
function navigate(page){activePage=page;renderDashboard();}
function closeProfileMenu(){
 const menu=$(".profile-dropdown");
 const toggle=$("[data-profile-toggle]");
 if(!menu||!toggle)return;
 menu.classList.add("hidden");
 toggle.setAttribute("aria-expanded","false");
}
document.addEventListener("click",async e=>{
 const notificationButton=e.target.closest("[data-notification-toggle]");
 if(notificationButton){
  const isOpen=notificationButton.getAttribute("aria-expanded")==="true";
  notificationButton.setAttribute("aria-expanded",String(!isOpen));
  const menu=$(".notification-menu");
  if(menu)menu.classList.toggle("hidden",isOpen);
  return;
 }
 if(!e.target.closest(".notification-menu-wrap"))$(".notification-menu")?.classList.add("hidden");
 const card=e.target.closest("[data-card-detail]");
 if(card&&!e.target.closest("button,a")){showDetail(card.dataset.cardDetail);return;}
 const el=e.target.closest("button,a");if(!el)return;
 if(el.hasAttribute("data-select-profile-photo")){$("#profile-photo-file")?.click();return;}
 if(el.hasAttribute("data-request-verification")){
  const platform=el.dataset.requestVerification;
  const platformStatus=socialVerificationStatus(platform);
  if($("#profile-form")?.dataset.profileDirty==="true"){toast("Simpan perubahan profil terlebih dahulu sebelum mengajukan verifikasi.");return;}
  if(!["instagram","tiktok"].includes(platform)||!isProfileSocialUrl(platform,String(currentUser[platform]||""))){toast(`Tambahkan link ${platform==="instagram"?"Instagram":"TikTok"} yang valid terlebih dahulu.`);return;}
  if(platformStatus==="pending"){toast("Konfirmasi tautan ini sudah menunggu persetujuan admin.");return;}
  if(platformStatus==="approved"){toast("Tautan ini sudah disetujui admin.");return;}
  const originalButtonText=el.textContent;
  el.disabled=true;
  el.setAttribute("aria-busy","true");
  el.setAttribute("aria-label","Mengirim permintaan konfirmasi");
  el.innerHTML='<span class="banner-upload-spinner" aria-hidden="true"></span> Mengirim…';
  try{
   const notification={
    id:`verification_${currentUser.uid}_${platform}_${Date.now()}`,
    to:"admin",
    recipientUid:"admin",
    senderUid:currentUser.uid,
    event:"verification_requested",
    platform,
    message:`${currentUser.name} meminta konfirmasi link ${platform==="instagram"?"Instagram":"TikTok"}.`,
    createdAt:Date.now(),
    read:false
   };
   if(firebaseConfigured)await submitVerificationRequestCloud(currentUser.uid,platform,notification);
   currentUser[`${platform}VerificationStatus`]="pending";
   currentUser[`${platform}VerificationRequestedAt`]=Date.now();
   const otherPlatform=platform==="instagram"?"tiktok":"instagram";
   const otherStatus=socialVerificationStatus(otherPlatform);
   currentUser.verificationStatus=otherStatus==="approved"?"approved":"pending";
   currentUser.verificationRequestedAt=Date.now();
   state.notifications.push(notification);
   const user=state.users.find(item=>currentUser.uid?item.uid===currentUser.uid:item.id===currentUser.id);
   if(user)Object.assign(user,{
    verificationStatus:currentUser.verificationStatus,
    verificationRequestedAt:currentUser.verificationRequestedAt,
    [`${platform}VerificationStatus`]:currentUser[`${platform}VerificationStatus`],
    [`${platform}VerificationRequestedAt`]:currentUser[`${platform}VerificationRequestedAt`]
   });
   save();renderDashboard();   toast("Konfirmasi link berhasil dikirim ke admin.");
  }catch(error){
   console.error("Failed to submit verification request",error);
   if(el.isConnected){
    el.disabled=false;
    el.removeAttribute("aria-busy");
    el.setAttribute("aria-label",originalButtonText);
    el.textContent=originalButtonText;
   }
   toast(`Gagal mengajukan verifikasi: ${error.message}`);
  }
  return;
 }
 if(el.dataset.verificationReview){
  const [uid,platform,status]=el.dataset.verificationReview.split("|");
  const user=state.users.find(item=>item.uid===uid||item.id===uid);
  if(!user||socialVerificationStatusForUser(user,platform)!=="pending"){toast("Pengajuan verifikasi ini sudah tidak menunggu.");return;}
  el.disabled=true;
  try{
   const notification={
    id:`verification_reviewed_${uid}_${platform}_${Date.now()}`,
    to:user.email||uid,
    recipientUid:uid,
    senderUid:currentUser.uid,
    event:"verification_reviewed",
      platform,
      message:status==="approved"
      ?`Tautan ${platform==="instagram"?"Instagram":"TikTok"} kamu telah disetujui admin. Jika profil sudah lengkap dan kamu sudah pernah mengajukan campaign Regular, verifikasi 100% dan akses campaign Spesial terbuka.`
      :`Konfirmasi tautan ${platform==="instagram"?"Instagram":"TikTok"} ditolak. Periksa tautan tersebut dan ajukan konfirmasi kembali.`,
    createdAt:Date.now(),
    read:false
   };
   if(firebaseConfigured)await reviewVerificationRequestCloud(uid,platform,status,notification);
   user[`${platform}VerificationStatus`]=status;
   const otherPlatform=platform==="instagram"?"tiktok":"instagram";
   const otherStatus=socialVerificationStatusForUser(user,otherPlatform);
   user.verificationStatus=status==="approved"||otherStatus==="approved"
    ?"approved"
    :otherStatus==="pending"?"pending":"rejected";
   user[`${platform}VerificationReviewedAt`]=Date.now();
   user.verificationReviewedAt=Date.now();
   state.notifications.push(notification);
   save();renderDashboard();
   toast(status==="approved"?"Link sosial KOL berhasil disetujui.":"Konfirmasi link KOL ditolak.");
  }catch(error){
   console.error("Failed to review verification request",error);
   el.disabled=false;toast(`Gagal memperbarui verifikasi: ${error.message}`);
  }
  return;
 }
 if(el.hasAttribute("data-profile-toggle")){
  const menu=$(".profile-dropdown");
  const isOpen=el.getAttribute("aria-expanded")==="true";
  menu?.classList.toggle("hidden",isOpen);
  el.setAttribute("aria-expanded",String(!isOpen));
  return;
 }
 if(el.hasAttribute("data-mark-read")){
  try{
   if(firebaseConfigured)await markNotificationsReadCloud(currentUser.uid,currentUser.role);
   state.notifications.filter(belongsToCurrentUserNotification).forEach(n=>n.read=true);
   mountNotificationDropdown();toast("Notifikasi ditandai sudah dibaca.");
  }catch(error){console.error(error);toast(`Gagal memperbarui notifikasi: ${error.message}`);}
  return;
 }
 if(el.hasAttribute("data-home")){e.preventDefault();currentUser?navigate("home"):landing();return;}
 if(el.hasAttribute("data-role")){rolePage();return;}
 if(el.dataset.roleSelect){authPage(el.dataset.roleSelect,"signup");return;}
 if(el.dataset.roleLogin){authPage(el.dataset.roleLogin,"login");return;}
 if(el.dataset.auth){if(el.dataset.auth==="admin")authPage("admin","login");else rolePage("login");return;}
 if(el.dataset.authMode){authPage(el.dataset.authRole,el.dataset.authMode);return;}
 if(el.dataset.page){navigate(el.dataset.page);return;}
 if(el.hasAttribute("data-logout")){logout();return;}
 if(el.hasAttribute("data-create")){showCampaignTypePicker();return;}
 if(el.dataset.createType){
  if(el.dataset.createType==="special")showSpecialProgramPicker();
  else showCreate(el.dataset.createType);
  return;
 }
 if(el.dataset.specialProgram){showCreate("special",null,el.dataset.specialProgram);return;}
 if(el.hasAttribute("data-choose-special-program")){showSpecialProgramPicker();return;}
 if(el.hasAttribute("data-choose-campaign-type")){showCampaignTypePicker();return;}
 if(el.dataset.editCampaign){
  const campaign=campaignById(el.dataset.editCampaign);
  if(!campaign||currentUser?.role!=="brand"||(campaign.ownerUid!==currentUser.uid&&campaign.ownerEmail!==currentUser.email)){toast("Kamu tidak memiliki izin untuk mengedit campaign ini.");return;}
  $("#detail-modal")?.remove();showCreate(campaign.type,campaign);return;
 }
 if(el.hasAttribute("data-topup")){showTopup();return;}
 if(el.dataset.topupReview){await showTopupReviewModal(el.dataset.topupReview);return;}
 if(el.hasAttribute("data-chat-toggle")){
  chatOpen=!chatOpen;
  if(chatOpen){
   const selected=chatConversations().find(item=>item.id===activeConversationId)||chatConversations()[0];
   if(selected){
    selected[currentUser.role==="brand"?"unreadForBrand":"unreadForKol"]=0;
    if(firebaseConfigured)markConversationReadCloud(selected.id,currentUser.role).catch(error=>console.error("Failed to mark chat read",error));
    else save();
   }
  }
  rerenderChatWidget();
  return;
 }
 if(el.dataset.chatConversation){
  activeConversationId=el.dataset.chatConversation;
  chatOpen=true;
  if(firebaseConfigured)startChatUpdates();
  else rerenderChatWidget();
  return;
 }
 if(el.dataset.reviewTopupStatus){
  if(currentUser?.role!=="admin"){toast("Hanya admin yang dapat memeriksa pembayaran.");return;}
  const [requestId,status]=el.dataset.reviewTopupStatus.split("|");
  const request=state.topupRequests.find(item=>item.id===requestId);
  if(!request||request.status!=="pending"){toast("Pengajuan top up ini sudah tidak menunggu konfirmasi.");return;}
  el.disabled=true;
  try{
   const notification={
    id:`topup_reviewed_${requestId}_${Date.now()}`,
    to:request.email,
    recipientUid:request.ownerUid,
    senderUid:currentUser.uid,
    event:"topup_reviewed",
    message:status==="approved"
     ?`Pembayaran top up ${rupiah(request.amount)} sudah dikonfirmasi. Saldo telah ditambahkan ke akunmu.`
     :`Bukti pembayaran top up ${rupiah(request.amount)} belum dapat disetujui. Silakan hubungi admin melalui WhatsApp.`,
    createdAt:Date.now(),
    read:false
   };
   const reviewedRequest=firebaseConfigured
    ?await reviewTopupRequestCloud(requestId,status,notification)
    :{...request,status,reviewedAt:Date.now()};
   state.topupRequests=state.topupRequests.map(item=>item.id===requestId?reviewedRequest:item);
   if(status==="approved"){
    const user=state.users.find(item=>item.uid===request.ownerUid);
    if(user)user.balance=reviewedRequest.balance;
   }
   state.notifications.push(notification);
   save();$("#topup-review-modal")?.remove();renderDashboard();
   toast(status==="approved"?"Pembayaran disetujui dan saldo berhasil ditambahkan.":"Pengajuan top up ditolak.");
  }catch(error){
   console.error("Failed to review top up request",error);
   el.disabled=false;
   toast(`Gagal memeriksa pembayaran: ${error.message}`);
  }
  return;
 }
 if(el.dataset.detail){showDetail(el.dataset.detail);return;}
 if(el.hasAttribute("data-admin-edit-terms")){
  if(currentUser?.role!=="admin"){toast("Hanya admin yang dapat mengubah syarat campaign.");return;}
  const campaign=campaignById(el.dataset.adminEditTerms);
  if(!campaign){toast("Campaign tidak ditemukan.");return;}
  showAdminCampaignTerms(campaign);
  return;
 }
 if(el.hasAttribute("data-complete-kol-profile")){$("#detail-modal")?.remove();navigate("profile");return;}
 if(el.dataset.apply){$("#detail-modal")?.remove();showApply(el.dataset.apply);return;}
 if(el.dataset.applicants){$("#detail-modal")?.remove();showApplicants(el.dataset.applicants);return;}
 if(el.hasAttribute("data-close-modal")){
  const modal=el.closest(".modal-backdrop");
  if(modal?.id==="create-modal"){bannerUploadRequest++;bannerUploadInProgress=false;uploadedBanner="";}
  if(modal?.id==="topup-modal"){uploadedTopupProof="";topupProofProcessing=false;topupProofRequest++;}
  modal?.remove();return;
 }
 if(el.hasAttribute("data-close-first")){$("#detail-modal")?.remove();return;}
 if(el.hasAttribute("data-refresh-admin")){
  try{const refreshed=await loadCloudState(currentUser,"admin");state={...state,...refreshed};renderDashboard();toast("Data dashboard berhasil diperbarui.");}
  catch(error){console.error(error);toast(`Gagal memuat data Firebase: ${error.message}`);}
  return;
 }
 if(el.hasAttribute("data-retry-dashboard")){
  const retryUser=currentUser;
  if(!retryUser)return;
  dashboardShell(`<div class="dashboard-loading" role="status"><span class="loading-spinner" aria-hidden="true"></span><div><h2>Memuat dashboard</h2><p>Mengambil data terbaru…</p></div></div>`);
  try{
   const refreshed=await loadCloudState(retryUser,retryUser.role);
   if(currentUser?.uid!==retryUser.uid)return;
   state={...state,...refreshed};renderDashboard();
  }catch(error){
   if(currentUser?.uid!==retryUser.uid)return;
   console.error(error);dashboardShell(`<div class="empty-state"><h3>Dashboard belum dapat dimuat</h3><p>${esc(error.message)}</p><button class="btn btn-outline" data-retry-dashboard>Coba Lagi</button></div>`);
   toast(`Gagal memuat data: ${error.message}`);
  }
  return;
 }
 if(el.dataset.applicationCategory){
  if(applicationCategories.some(category=>category.id===el.dataset.applicationCategory)){
   activeApplicationCategory=el.dataset.applicationCategory;
   applicationsPage();
  }
  return;
 }
 if(el.dataset.review){
  try{
   const [aid,cid,status]=el.dataset.review.split("|");const c=campaignById(cid);const a=c?.applicants.find(x=>x.id===aid);if(!a)return;
   const currentStatus=a.status||"Menunggu";
   const allowedNextStatuses=currentStatus==="Menunggu"?["Diterima","Ditolak"]:[applicationNextAction(currentStatus)?.nextStatus].filter(Boolean);
   if(!allowedNextStatuses.includes(status)){toast("Tahap pengajuan sudah berubah atau aksi ini tidak tersedia.");applicationsPage();return;}
   if(firebaseConfigured)await updateApplicationCloud(a,status);
   a.status=status;
   if(status==="Diterima"){
    if(firebaseConfigured)await ensureConversationCloud({...a,status});
    else{
     const conversation={id:a.id,applicationId:a.id,campaignId:a.campaignId,campaignTitle:c.title,brandUid:a.ownerUid,brandName:c.brandName,kolUid:a.applicantUid,kolName:a.name,createdAt:Date.now(),updatedAt:Date.now(),lastMessage:"",unreadForBrand:0,unreadForKol:0};
     state.conversations=[...(state.conversations||[]).filter(item=>item.id!==a.id),conversation];
    }
   }
   const statusMessages={
    Diterima:"pengajuanmu telah di-ACC",
    Ditolak:"pengajuanmu ditolak",
    "Product Shipping":"campaign masuk ke tahap Product Shipping",
    "Draft Video":"produk diterima dan campaign masuk ke tahap Draft Video",
    Payment:"draft video dikonfirmasi dan campaign masuk ke tahap Payment"
   };
   const notification=addNotification(a.email,`Status campaign "${c.title}" diperbarui: ${statusMessages[status]}.`,a.applicantUid,a.id,"application_reviewed");
   if(firebaseConfigured)await addNotificationCloud(notification);
   save();applicationsPage();toast(`Status pengajuan diperbarui ke ${status}.`);
  }catch(error){console.error(error);toast(`Gagal memperbarui pengajuan: ${error.message}`);}
  return;
 }
});
document.addEventListener("keydown",e=>{
 if(e.key==="Escape"){
  $(".notification-menu")?.classList.add("hidden");
  $("[data-notification-toggle]")?.setAttribute("aria-expanded","false");
 }
 if((e.key==="Enter"||e.key===" ")&&e.target.matches("[data-card-detail]")){
  e.preventDefault();
  showDetail(e.target.dataset.cardDetail);
 }
});
document.addEventListener("click",e=>{
 if(!e.target.closest(".profile-menu"))closeProfileMenu();
});
document.addEventListener("keydown",e=>{
 if(e.key==="Escape")closeProfileMenu();
});
document.addEventListener("submit",async e=>{
 e.preventDefault();const form=e.target;
 try{
 if(form.id==="chat-form"){
  const text=String(new FormData(form).get("message")||"").trim();
  const conversation=chatConversations().find(item=>item.id===form.dataset.chatId);
  if(!text||!conversation)return;
  const button=form.querySelector("button[type=submit]");
  if(button)button.disabled=true;
  if(firebaseConfigured){
   await sendChatMessageCloud(conversation,currentUser,text);
  }else{
   const message={id:`message_${Date.now()}`,senderUid:currentUser.uid,senderName:currentUser.name||currentUser.email,text,createdAt:Date.now()};
   state.chatMessages[conversation.id]=[...(state.chatMessages[conversation.id]||[]),message];
   conversation.lastMessage=text;
   conversation.updatedAt=message.createdAt;
   conversation[currentUser.role==="brand"?"unreadForKol":"unreadForBrand"]=(conversation[currentUser.role==="brand"?"unreadForKol":"unreadForBrand"]||0)+1;
   save();
   rerenderChatWidget();
  }
  return;
 }
 if(form.id==="admin-campaign-terms-form"){
  if(currentUser?.role!=="admin"){toast("Hanya admin yang dapat mengubah syarat campaign.");return;}
  const data=Object.fromEntries(new FormData(form).entries());
  const campaign=campaignById(String(data.campaignId||""));
  if(!campaign||campaign.type!=="special"){toast("Campaign Spesial tidak ditemukan.");return;}
  const terms=String(data.terms||"").trim();
  const button=form.querySelector('button[type="submit"]');
  if(button){button.disabled=true;button.textContent="Menyimpan…";}
  try{
   if(firebaseConfigured)await updateCampaignTermsCloud(campaign.id,terms);
   campaign.terms=terms;
   save();
   $("#admin-terms-modal")?.remove();
   renderDashboard();
   toast("Syarat campaign berhasil diperbarui.");
  }finally{
   if(button?.isConnected){button.disabled=false;button.textContent="Simpan Syarat →";}
  }
  return;
 }
 if(form.id==="topup-form"){
  if(currentUser?.role!=="brand"){toast("Pengajuan top up hanya tersedia untuk akun brand.");return;}
  if(!firebaseConfigured){toast("Pengajuan top up memerlukan Firebase aktif agar admin dapat memeriksa bukti pembayaran.");return;}
  if(topupProofProcessing){toast("Tunggu sampai bukti pembayaran selesai diproses.");return;}
  if(!uploadedTopupProof){toast("Pilih bukti pembayaran berformat JPG terlebih dahulu.");return;}
  const method="Transfer bank";
  if(state.topupRequests.some(request=>request.status==="pending")){toast("Pengajuan top up kamu masih menunggu pemeriksaan admin.");showTopup();return;}
  const button=form.querySelector('button[type="submit"]');
  if(button){button.disabled=true;button.textContent="Mengirim bukti pembayaran…";}
  try{
   const request={
    ownerUid:currentUser.uid,
    brandName:currentUser.name,
    email:currentUser.email,
    amount:CAMPAIGN_CREATION_COST,
    method,
    receiptData:uploadedTopupProof,
    createdAt:Date.now()
   };
   const notification={
    id:`topup_submitted_${currentUser.uid}_${Date.now()}`,
    to:"admin",
    recipientUid:"admin",
    senderUid:currentUser.uid,
    event:"topup_submitted",
    message:`${currentUser.name} mengirim bukti pembayaran top up ${rupiah(CAMPAIGN_CREATION_COST)} melalui ${method}.`,
    createdAt:Date.now(),
    read:false
   };
   const submittedRequest=await createTopupRequestCloud(request,notification);
   state.topupRequests=[submittedRequest,...state.topupRequests.filter(item=>item.id!==submittedRequest.id)];
   state.notifications.push({...notification,topupRequestId:submittedRequest.id});
   uploadedTopupProof="";
   topupProofProcessing=false;
   save();
   showTopupSubmitted(submittedRequest);
  }catch(error){
   console.error("Failed to submit top up proof",error);
   if(button?.isConnected){button.disabled=false;button.textContent="Kirim Bukti Pembayaran →";}
   toast(`Gagal mengirim bukti pembayaran: ${error.message}`);
  }
  return;
 }
 if(form.id==="auth-form"){
  const data=Object.fromEntries(new FormData(form).entries());const role=form.dataset.roleForm,mode=form.dataset.mode;
  const email=data.email.trim().toLowerCase();
  if(mode==="signup"){
   if(!firebaseConfigured&&state.users.some(u=>u.email===email&&u.role===role)){toast("Email sudah terdaftar. Pilih tab Masuk untuk login.");return;}
   authFlowInProgress=firebaseConfigured;
   if(firebaseConfigured){
    currentUser=await createAccount(email,data.password,data.name.trim(),role);
    state={...state,...await loadCloudState(currentUser,role)};
    startNotificationUpdates();
   }else{
    authFlowInProgress=firebaseConfigured;
    const user={id:"u"+Date.now(),role,name:data.name.trim(),email,password:data.password,balance:0,createdAt:Date.now(),verificationStatus:role==="kol"?"not_requested":"not_applicable",instagramVerificationStatus:role==="kol"?"not_requested":"",tiktokVerificationStatus:role==="kol"?"not_requested":""};
    state.users.push(user);save();currentUser={...user};
   }
   authFlowInProgress=false;activePage="home";renderDashboard();startChatUpdates();toast("Akun berhasil dibuat. Selamat datang!");
  }else{
   authFlowInProgress=firebaseConfigured;
   if(firebaseConfigured){
    currentUser=await signInAccount(email,data.password,role);
    startNotificationUpdates();
    state={users:[],campaigns:[],notifications:[],applications:[],topupRequests:[],conversations:[],chatMessages:{}};
    activePage="home";
    dashboardShell(`<div class="dashboard-loading" role="status"><span class="loading-spinner" aria-hidden="true"></span><div><h2>Berhasil masuk</h2><p>Memuat campaign dan aktivitas terbaru…</p></div></div>`);
    toast("Berhasil masuk.");
    const signedInUid=currentUser.uid;
    authFlowInProgress=false;
    loadCloudState(currentUser,currentUser.role).then(cloudState=>{
     if(currentUser?.uid!==signedInUid)return;
     state={...state,...cloudState};
     renderDashboard();
    }).catch(error=>{
     if(currentUser?.uid!==signedInUid)return;
     console.error(error);
     dashboardShell(`<div class="empty-state"><h3>Dashboard belum dapat dimuat</h3><p>${esc(error.message)}</p><button class="btn btn-outline" data-retry-dashboard>Coba Lagi</button></div>`);
     toast("Login berhasil, tetapi data dashboard gagal dimuat.");
    });
    return;
   }else{
    if(firebaseConfigured){
     currentUser=await signInAccount(email,data.password,role);
     state={...state,...await loadCloudState(currentUser,currentUser.role)};
     startNotificationUpdates();
    }else{
     const user=state.users.find(u=>u.email===email&&u.role===role&&u.password===data.password);
     if(!user){toast("Email atau password salah, atau akun belum terdaftar.");return;}
     currentUser={...user};
    }
    authFlowInProgress=false;activePage="home";renderDashboard();startChatUpdates();toast("Berhasil masuk.");
   }
   authFlowInProgress=false;
   activePage="home";renderDashboard();toast("Berhasil masuk.");
  }
 }
 if(form.id==="campaign-program-form"){
  if(currentUser?.role!=="admin"){toast("Hanya admin yang dapat menambahkan program campaign.");return;}
  const data=Object.fromEntries(new FormData(form).entries());
  const name=String(data.name||"").trim();
  const description=String(data.description||"").trim();
  if(!name){toast("Isi nama program campaign.");return;}
  if(state.specialPrograms.some(program=>program.name.toLocaleLowerCase("id-ID")===name.toLocaleLowerCase("id-ID"))){toast("Nama program tersebut sudah tersedia.");return;}
  const button=form.querySelector('button[type="submit"]');
  if(button){button.disabled=true;button.textContent="Menyimpan…";}
  try{
   const program=firebaseConfigured
    ?await createCampaignProgramCloud(name,description)
    :{id:`program_${Date.now()}`,name,description,createdAt:Date.now(),active:true};
   state.specialPrograms=mergeCampaignPrograms([...state.specialPrograms,program]);
   save();renderDashboard();toast("Program campaign berhasil ditambahkan.");
  }catch(error){
   console.error("Failed to add campaign program",error);
   if(button?.isConnected){button.disabled=false;button.textContent="＋ Tambah Program";}
   toast(`Gagal menambahkan program campaign: ${error.message}`);
  }
  return;
 }
 if(form.id==="profile-form"){
  const data=Object.fromEntries(new FormData(form).entries());
  const profile={
   name:String(data.name||currentUser.name||"").trim(),
   instagram:String(data.instagram||"").trim(),
   tiktok:String(data.tiktok||"").trim(),
   whatsapp:String(data.whatsapp||"").trim(),
   photoData:currentUser.role==="kol"?(pendingProfilePhoto||currentUser.photoData||""):""
  };
  if(!profile.name){toast("Nama lengkap wajib diisi.");return;}
  if(profile.instagram&&!isProfileSocialUrl("instagram",profile.instagram)){toast("Masukkan link profil Instagram yang valid, misalnya https://www.instagram.com/username.");return;}
  if(profile.tiktok&&!isProfileSocialUrl("tiktok",profile.tiktok)){toast("Masukkan link profil TikTok yang valid, misalnya https://www.tiktok.com/@username.");return;}
  const socialLinksChanged=currentUser.role==="kol"
   &&(profile.instagram!==String(currentUser.instagram||"")||profile.tiktok!==String(currentUser.tiktok||""));
  const instagramChanged=currentUser.role==="kol"&&profile.instagram!==String(currentUser.instagram||"");
  const tiktokChanged=currentUser.role==="kol"&&profile.tiktok!==String(currentUser.tiktok||"");
  if((instagramChanged&&socialVerificationStatus("instagram")==="pending")
   ||(tiktokChanged&&socialVerificationStatus("tiktok")==="pending")){
   toast("Tautan yang sedang ditinjau admin tidak dapat diubah sampai pemeriksaan selesai.");
   return;
  }
  const instagramVerificationStatus=currentUser.role==="kol"
   ?instagramChanged?"not_requested":socialVerificationStatus("instagram")
   :currentUser.instagramVerificationStatus||"";
  const tiktokVerificationStatus=currentUser.role==="kol"
   ?tiktokChanged?"not_requested":socialVerificationStatus("tiktok")
   :currentUser.tiktokVerificationStatus||"";
  const nextVerificationStatus=currentUser.role!=="kol"?currentUser.verificationStatus
   :instagramVerificationStatus==="approved"||tiktokVerificationStatus==="approved"
    ?"approved"
    :instagramVerificationStatus==="pending"||tiktokVerificationStatus==="pending"
     ?"pending"
     :instagramVerificationStatus==="rejected"||tiktokVerificationStatus==="rejected"?"rejected":"not_requested";
  const button=form.querySelector('button[type="submit"]');
  const originalButtonText=button?.textContent;
  if(button){button.disabled=true;button.textContent="Menyimpan…";}
  try{
   if(firebaseConfigured)await updateUserProfileCloud(currentUser.uid,profile);
   Object.assign(currentUser,profile);
   currentUser.instagramVerificationStatus=instagramVerificationStatus;
   currentUser.tiktokVerificationStatus=tiktokVerificationStatus;
   currentUser.verificationStatus=nextVerificationStatus;
   if(socialLinksChanged){currentUser.verificationRequestedAt=null;currentUser.verificationReviewedAt=null;}
   const storedUser=state.users.find(user=>currentUser.uid?user.uid===currentUser.uid:user.id===currentUser.id);
   if(storedUser)Object.assign(storedUser,profile,{
    verificationStatus:currentUser.verificationStatus,
    instagramVerificationStatus,
    tiktokVerificationStatus,
    verificationRequestedAt:currentUser.verificationRequestedAt,
    verificationReviewedAt:currentUser.verificationReviewedAt
   });
   save();
   pendingProfilePhoto="";
  }finally{
   if(button?.isConnected){button.disabled=false;button.textContent=originalButtonText;}
  }
  renderDashboard();toast("Profil berhasil diperbarui.");
 }
 if(form.id==="create-form"){
  if(bannerUploadInProgress){toast("Tunggu sampai banner selesai diunggah.");return;}
  const data=Object.fromEntries(new FormData(form).entries());
  const campaignId=String(data.campaignId||"");
  const existingCampaign=campaignId?campaignById(campaignId):null;
  if(!campaignId&&Number(currentUser?.balance||0)<CAMPAIGN_CREATION_COST){
   $("#create-modal")?.remove();
   showTopup();
   toast("Saldo tidak cukup. Top up saldo Rp100.000 untuk membuat campaign.");
   return;
  }
  const feeAmount=parseRupiahInput(data.cpm);
  if(data.type==="special"&&(!Number.isSafeInteger(feeAmount)||feeAmount<=0)){toast("Isi nilai CPM yang valid dalam Rupiah.");return;}
  if(data.type==="special"&&!state.specialPrograms.some(program=>program.id===String(data.specialProgram))&&!(existingCampaign?.specialProgram===String(data.specialProgram))){toast("Pilih program campaign yang masih tersedia.");return;}
  if(campaignId){
   const campaign=campaignById(campaignId);
   if(!campaign||currentUser?.role!=="brand"||(campaign.ownerUid!==currentUser.uid&&campaign.ownerEmail!==currentUser.email)){toast("Campaign tidak ditemukan atau kamu tidak memiliki izin untuk mengeditnya.");return;}
   const changes={
    brandName:currentUser.name,
    type:campaign.type,
    title:data.title.trim(),
    description:data.description.trim(),
    terms:campaign.type==="special"?campaign.terms||"":data.terms.trim(),
    fee:campaign.type==="special"?feeAmount:campaign.fee,
    cpm:campaign.type==="special"?feeAmount:campaign.cpm||0,
    videoCount:campaign.type==="special"?campaign.videoCount||0:campaign.videoCount,
    reward:campaign.type==="special"?"CPM per 1.000 tayangan":"Pengajuan Fee",
    banner:uploadedBanner,
    specialProgram:campaign.type==="special"?String(data.specialProgram||campaign.specialProgram||"available"):""
   };
   await withCampaignSaveState(form,()=>firebaseConfigured?updateCampaignCloud(campaignId,changes):Promise.resolve());
   Object.assign(campaign,changes);
   save();$("#create-modal")?.remove();activePage="campaigns";renderDashboard();toast("Campaign berhasil diperbarui.");
   return;
  }
  const c={id:"c"+Date.now(),brandName:currentUser.name,ownerEmail:currentUser.email,ownerUid:currentUser.uid,type:data.type,title:data.title.trim(),description:data.description.trim(),terms:data.type==="special"?"":data.terms.trim(),fee:data.type==="special"?feeAmount:0,cpm:data.type==="special"?feeAmount:0,videoCount:0,reward:data.type==="special"?"CPM per 1.000 tayangan":"Pengajuan Fee",banner:uploadedBanner,specialProgram:data.type==="special"?String(data.specialProgram||"umkm"):"",slots:5,applicants:[],applicantsCount:0,createdAt:Date.now()};
  const balanceBeforeCreate=Number(currentUser.balance)||0;
  const balanceAfterCreate=await withCampaignSaveState(form,()=>firebaseConfigured
   ?createCampaignCloud(c,currentUser)
   :Promise.resolve(balanceBeforeCreate-CAMPAIGN_CREATION_COST));
  updateCurrentUserBalance(balanceAfterCreate);
  state.campaigns.unshift(c);
  const campaignNotice=addNotification(currentUser.email,`Campaign "${c.title}" berhasil dibuat dan sekarang tampil untuk KOL.`,currentUser.uid,c.id,"campaign_created");
  let notificationSaved=true;
  if(firebaseConfigured){
   try{await addNotificationCloud(campaignNotice);}
   catch(error){
    notificationSaved=false;
    state.notifications=state.notifications.filter(item=>item.id!==campaignNotice.id);
    console.error("Campaign created but its notification failed to save",error);
   }
  }
  save();$("#create-modal")?.remove();activePage="home";renderDashboard();
  toast(notificationSaved?"Campaign berhasil dibuat dan tampil di daftar campaign.":"Campaign berhasil dibuat, tetapi notifikasinya gagal disimpan.");
 }
 if(form.id==="apply-form"){
   const c=campaignById(applicantCampaignId);if(!c)return;
   if(c.type==="special"&&!kolVerified()){$("#apply-modal")?.remove();showSpecialCampaignVerificationNotice();return;}
  if(c.type==="special"&&firebaseConfigured&&currentUser.regularApplicationCompleted!==true){
   const regularApplication=myApplications().find(application=>application.campaign?.type==="regular");
   if(!regularApplication?.campaign?.id){
    toast("Pengajuan Regular belum tercatat sebagai tahap verifikasi.");return;
   }
   await markRegularApplicationCompletedCloud(currentUser.uid,regularApplication.campaign.id);
   currentUser.regularApplicationCompleted=true;
  }
  if((c.applicants||[]).some(a=>a.email===currentUser.email)){toast("Kamu sudah mengajukan campaign ini.");$("#apply-modal")?.remove();return;}
  const data=Object.fromEntries(new FormData(form).entries());
  const instagram=String(currentUser.instagram||"").trim();
  const tiktok=String(currentUser.tiktok||"").trim();
  if(c.type==="special"&&!instagram&&!tiktok){toast("Campaign Spesial memerlukan link Instagram atau TikTok yang terverifikasi.");return;}
  const applicationFee=parseRupiahInput(data.fee);
  if(c.type==="regular"&&(!Number.isSafeInteger(applicationFee)||applicationFee<0)){toast("Masukkan fee yang valid dalam Rupiah.");return;}
  const firstRegularApplication=c.type==="regular"&&!hasRegularApplication();
  const a={id:firebaseConfigured?`${c.id}_${currentUser.uid}`:"a"+Date.now(),name:String(currentUser.name||""),email:currentUser.email,instagram,tiktok,social:instagram||tiktok,fee:c.type==="regular"?applicationFee:c.fee,status:"Menunggu",createdAt:Date.now(),applicantUid:currentUser.uid,applicantVerified:kolProfileApproved()&&(kolVerified()||firstRegularApplication)};
  if(firebaseConfigured)await submitApplicationCloud(c,a,currentUser.uid);
  if(c.type==="regular")currentUser.regularApplicationCompleted=true;
  c.applicants.push(a);c.applicantsCount=applicantCount(c)+1;
  const notification=addNotification(c.ownerEmail||c.ownerUid,`${a.name} mengajukan campaign "${c.title}". ${c.type==="regular"?"Fee yang diajukan: "+rupiah(a.fee)+".":(c.cpm!==undefined||!Number(c.videoCount)?"CPM: "+rupiah(campaignCpm(c))+" per 1.000 tayangan.":"Paket: "+rupiah(c.fee)+" / "+c.videoCount+" video.")}`,c.ownerUid,a.id,"application_submitted");
  let notificationSaved=true;
  if(firebaseConfigured){
   try{await addNotificationCloud(notification);}
   catch(error){
    notificationSaved=false;
    state.notifications=state.notifications.filter(item=>item.id!==notification.id);
    console.error("Application submitted but its brand notification failed to save",error);
   }
  }
  save();$("#apply-modal")?.remove();$("#detail-modal")?.remove();activePage="applications";renderDashboard();
  toast(notificationSaved?"Pengajuan berhasil dikirim ke brand.":"Pengajuan terkirim, tetapi notifikasi ke brand gagal disimpan.");
 }
 }catch(error){
  if(authFlowInProgress&&firebaseConfigured){
   try{await signOutAccount();}catch(signOutError){console.error(signOutError);}
  }
  authFlowInProgress=false;console.error(error);toast(`Operasi gagal: ${error.message}`);
 }
});
document.addEventListener("input",e=>{
 if(e.target.matches("[data-rupiah-input]"))formatRupiahInput(e.target);
  if(e.target.matches("#profile-form input[name='name'], #profile-form input[name='instagram'], #profile-form input[name='tiktok'], #profile-form input[name='whatsapp']")){
   const profileForm=$("#profile-form");
   if(profileForm)profileForm.dataset.profileDirty="true";
   $$("#profile-form [data-request-verification]").forEach(button=>button.disabled=true);
   const help=$("#verification-help");
   if(help)help.textContent="Simpan perubahan profil terlebih dahulu sebelum mengajukan verifikasi.";
 }
});
document.addEventListener("change",async e=>{
 if(e.target.id==="topup-proof"){
  const file=e.target.files?.[0];
  const requestId=++topupProofRequest;
  const preview=$("#topup-proof-preview");
  uploadedTopupProof="";
  topupProofProcessing=false;
  if(preview){preview.replaceChildren();preview.classList.add("hidden");}
  if(!file)return;
  const extension=file.name.split(".").pop()?.toLowerCase();
  if(!["jpg","jpeg"].includes(extension)||file.type!=="image/jpeg"){
   e.target.value="";
   toast("Bukti pembayaran harus berupa file JPG/JPEG.");
   return;
  }
  if(file.size>5*1024*1024){
   e.target.value="";
   toast("Ukuran bukti pembayaran maksimal 5 MB.");
   return;
  }
  topupProofProcessing=true;
  try{
   const proof=await compressBannerToDataUrl(file);
   if(requestId!==topupProofRequest||!$("#topup-proof"))return;
   uploadedTopupProof=proof;
   topupProofProcessing=false;
   if(preview){
    preview.innerHTML=`<img src="${esc(proof)}" alt="Pratinjau bukti pembayaran JPG"><span class="small muted">${esc(file.name)} siap dikirim · ${Math.round(proof.length*0.75/1024)} KB</span>`;
    preview.classList.remove("hidden");
   }
  }catch(error){
   if(requestId!==topupProofRequest)return;
   topupProofProcessing=false;
   e.target.value="";
   console.error("Top up receipt processing failed",error);
   toast(`Gagal memproses bukti pembayaran: ${error.message}`);
  }
  return;
 }
 if(e.target.id==="profile-photo-file"){
  const file=e.target.files?.[0];
  const preview=$("#profile-photo-preview"),hint=$("#profile-photo-hint");
  const button=$("#profile-form button[type='submit']");
  const requestId=++profilePhotoRequest;
  pendingProfilePhoto="";
  const profileForm=$("#profile-form");
  if(profileForm)profileForm.dataset.profileDirty="true";
  $$("#profile-form [data-request-verification]").forEach(button=>button.disabled=true);
  const verificationHelp=$("#verification-help");
  if(verificationHelp)verificationHelp.textContent="Simpan perubahan profil terlebih dahulu sebelum mengajukan verifikasi.";
  if(button)button.disabled=true;
  if(!file){if(hint)hint.textContent="Klik foto untuk mengganti foto profil.";if(button)button.disabled=false;return;}
  if(hint)hint.textContent="Memproses foto…";
  try{
   const photoData=await compressProfilePhoto(file);
   if(requestId!==profilePhotoRequest)return;
   pendingProfilePhoto=photoData;
   if(preview)preview.innerHTML=avatarContent(currentUser.name,pendingProfilePhoto);
   if(hint)hint.textContent=`${file.name} siap digunakan sebagai foto profil.`;
   if(button)button.disabled=false;
  }catch(error){
   if(requestId!==profilePhotoRequest)return;
   e.target.value="";
   if(hint)hint.textContent="Gagal memproses foto. Profil sebelumnya tetap digunakan; kamu bisa coba pilih ulang.";
   if(button)button.disabled=false;
   console.error("Profile photo processing failed",error);
   toast(error.message);
  }
  return;
 }
 if(e.target.id==="banner-file"){
  const file=e.target.files?.[0];
  const requestId=++bannerUploadRequest;
  bannerUploadInProgress=false;
  const preview=$("#banner-preview"),previewImage=$("#banner-preview-image"),previewStatus=$("#banner-preview-status");
  const progress=$("#banner-upload-progress"),progressBar=$("#banner-upload-progress-bar"),progressText=$("#banner-upload-progress-text");
  const previousBanner=uploadedBanner;
  const restorePreview=()=>{
   if(previousBanner){
    previewImage.src=previousBanner;
    preview.classList.remove("hidden");
    previewStatus.textContent="Banner sebelumnya tetap digunakan";
   }else{
    preview?.classList.add("hidden");
   }
  };
  progress?.classList.add("hidden");
  if(!file)return;
  const validationError=validateBannerFile(file);
  if(validationError==="format"){
   e.target.value="";
   restorePreview();
   toast("Format gambar harus JPG atau PNG.");
   return;
  }
  if(validationError==="size"){
   e.target.value="";
   restorePreview();
   toast("Ukuran gambar maksimal 2 MB.");
   return;
  }
  bannerUploadInProgress=true;
  try{
   preview.classList.remove("hidden");
   previewStatus.textContent=`${file.name} · Mengoptimalkan gambar…`;
   progress?.classList.remove("hidden");
   if(progressBar)progressBar.style.width="0%";
   if(progressText)progressText.textContent="0%";
   const compressedBanner=await compressBannerToDataUrl(file,value=>{
    if(requestId!==bannerUploadRequest)return;
    if(progressBar)progressBar.style.width=`${value}%`;
    if(progressText)progressText.textContent=`${value}%`;
   });
   if(requestId!==bannerUploadRequest)return;
   uploadedBanner=compressedBanner;
   previewImage.src=compressedBanner;
   if(requestId!==bannerUploadRequest)return;
   bannerUploadInProgress=false;
   previewStatus.textContent=`${file.name} · Siap (${Math.round(compressedBanner.length*0.75/1024)} KB)`;
   progress?.classList.add("hidden");
  }catch(error){
   if(requestId!==bannerUploadRequest)return;
   bannerUploadInProgress=false;
   e.target.value="";
   uploadedBanner=previousBanner;
   progress?.classList.add("hidden");
   restorePreview();
   console.error("Campaign banner processing failed",error);
   toast(`Gagal memproses banner: ${error.message}`);
  }
 }
});
app.addEventListener("input",e=>{
 if(e.target.id==="campaign-search"){
  const q=e.target.value.toLowerCase();const filtered=state.campaigns.filter(c=>remaining(c)>0&&(c.title+" "+c.brandName+" "+campaignProgramName(c.specialProgram||"umkm")).toLowerCase().includes(q));
  const box=$("#campaign-results");if(box)box.innerHTML=filtered.length?filtered.map(c=>campaignCard(c,"kol")).join(""):`<div class="empty-state" style="grid-column:1/-1"><h3>Campaign tidak ditemukan</h3><p>Coba kata kunci yang lain.</p></div>`;
 }
});
if(firebaseConfigured){
 observeAuth(firebaseUser=>{
  if(authFlowInProgress)return;
  if(firebaseUser)return;
  currentUser=null;
  activePage="home";
  landing();
 });
}
landing();
if(firebaseConfigurationIncomplete)toast("Konfigurasi Firebase belum lengkap. Periksa firebase-config.js.");
