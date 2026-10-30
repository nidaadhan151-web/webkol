import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  increment,
  onSnapshot,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  writeBatch
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import {
  getDownloadURL,
  getStorage,
  ref as storageRef
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-storage.js";
const requiredConfig = ["apiKey", "authDomain", "projectId", "messagingSenderId", "appId"];
export const CAMPAIGN_CREATION_COST = 100000;
export const firebaseConfigured = requiredConfig.every(key => Boolean(firebaseConfig[key]));
export const firebaseConfigurationIncomplete = requiredConfig.some(key => Boolean(firebaseConfig[key])) && !firebaseConfigured;

const firebaseApp = firebaseConfigured ? initializeApp(firebaseConfig) : null;
export const auth = firebaseApp ? getAuth(firebaseApp) : null;
const db = firebaseApp ? getFirestore(firebaseApp) : null;
const storage = firebaseApp ? getStorage(firebaseApp) : null;

function requireFirebase() {
  if (!auth || !db) throw new Error("Konfigurasi Firebase belum lengkap. Isi firebase-config.js terlebih dahulu.");
}

export function observeAuth(callback) {
  if (!auth) return () => {};
  return onAuthStateChanged(auth, callback);
}

export async function createAccount(email, password, name, role) {
  requireFirebase();
  let credential;
  try {
    credential = await createUserWithEmailAndPassword(auth, email, password);
  } catch (error) {
    if (error.code !== "auth/email-already-in-use") throw error;

    credential = await signInWithEmailAndPassword(auth, email, password);
    let existingProfile;
    try {
      existingProfile = await getDoc(doc(db, "users", credential.user.uid));
    } catch (profileError) {
      if (profileError.code === "permission-denied") {
        throw new Error("Tidak bisa memeriksa profil Firestore akun ini. Deploy firestore.rules terbaru, lalu ulangi pendaftaran.");
      }
      throw profileError;
    }
    if (existingProfile.exists()) {
      await signOut(auth);
      throw new Error("Email ini sudah terdaftar. Pilih tab Masuk untuk login.");
    }
  }
  await updateProfile(credential.user, { displayName: name });
  const profile = {
    uid: credential.user.uid,
    role,
    name,
    email: credential.user.email,
    balance: 0,
    createdAt: Date.now()
  };
  if (role === "kol") {
    profile.verificationStatus = "not_requested";
    profile.instagramVerificationStatus = "not_requested";
    profile.tiktokVerificationStatus = "not_requested";
  }
  try {
    await setDoc(doc(db, "users", credential.user.uid), profile);
  } catch (error) {
    if (error.code === "permission-denied") {
      throw new Error("Akun Firebase sudah dibuat, tetapi profil Firestore ditolak. Deploy firestore.rules terbaru, lalu coba daftar lagi dengan email dan password yang sama.");
    }
    throw error;
  }
  return {
    uid: credential.user.uid,
    email: credential.user.email,
    role,
    name,
    balance: 0,
    verificationStatus: profile.verificationStatus || "not_requested",
    regularApplicationCompleted: profile.regularApplicationCompleted === true,
    instagramVerificationStatus: profile.instagramVerificationStatus || "not_requested",
    tiktokVerificationStatus: profile.tiktokVerificationStatus || "not_requested"
  };
}

export async function signInAccount(email, password, requestedRole) {
  requireFirebase();
  const credential = await signInWithEmailAndPassword(auth, email, password);
  const [token, profileSnapshot] = await Promise.all([
    credential.user.getIdTokenResult(),
    getDoc(doc(db, "users", credential.user.uid))
  ]);
  const isAdmin = token.claims.admin === true;
  if (requestedRole === "admin" && !isAdmin) {
    await signOut(auth);
    throw new Error("Akun ini tidak memiliki akses administrator.");
  }
  if (requestedRole !== "admin" && isAdmin) {
    await signOut(auth);
    throw new Error("Silakan masuk melalui menu administrator.");
  }
  const profile = profileSnapshot.data();
  if (!isAdmin && !profileSnapshot.exists()) {
    await signOut(auth);
    throw new Error("Profil Firestore akun ini belum tersedia. Pilih Daftar dengan email dan password yang sama untuk memulihkan profil.");
  }
  if (!isAdmin && profile.role !== requestedRole) {
    await signOut(auth);
    throw new Error("Peran akun tidak sesuai. Masuk menggunakan peran yang dipilih saat mendaftar.");
  }
  return {
    uid: credential.user.uid,
    email: credential.user.email,
    name: profile?.name || credential.user.displayName || credential.user.email,
    role: isAdmin ? "admin" : profile.role,
    balance: profile?.balance || 0,
    instagram: profile?.instagram || "",
    tiktok: profile?.tiktok || "",
    whatsapp: profile?.whatsapp || "",
    photoData: profile?.photoData || "",
    verificationStatus: profile?.verificationStatus || "not_requested",
    regularApplicationCompleted: profile?.regularApplicationCompleted === true,
    instagramVerificationStatus: profile?.instagramVerificationStatus || "",
    tiktokVerificationStatus: profile?.tiktokVerificationStatus || ""
  };
}

export async function restoreAccount(firebaseUser) {
  requireFirebase();
  const token = await firebaseUser.getIdTokenResult();
  const isAdmin = token.claims.admin === true;
  const profileSnapshot = await getDoc(doc(db, "users", firebaseUser.uid));
  const profile = profileSnapshot.data();
  if (!isAdmin && (!profile || !["kol", "brand"].includes(profile.role))) {
    throw new Error("Profil akun tidak ditemukan atau perannya tidak valid.");
  }
  const account = {
    uid: firebaseUser.uid,
    email: firebaseUser.email,
    name: profile?.name || firebaseUser.displayName || firebaseUser.email,
    role: isAdmin ? "admin" : profile.role,
    balance: profile?.balance || 0,
    instagram: profile?.instagram || "",
    tiktok: profile?.tiktok || "",
    whatsapp: profile?.whatsapp || "",
    photoData: profile?.photoData || "",
    verificationStatus: profile?.verificationStatus || "not_requested",
    regularApplicationCompleted: profile?.regularApplicationCompleted === true,
    instagramVerificationStatus: profile?.instagramVerificationStatus || "",
    tiktokVerificationStatus: profile?.tiktokVerificationStatus || ""
  };
  return { account, state: await loadCloudState(firebaseUser, account.role) };
}

export async function signOutAccount() {
  if (auth) await signOut(auth);
}

export async function updateUserProfileCloud(uid, profile) {
  requireFirebase();
  const userRef = doc(db, "users", uid);
  const snapshot = await getDoc(userRef);
  if (!snapshot.exists()) throw new Error("Profil pengguna tidak ditemukan.");
  const existing = snapshot.data();
  const changes = {
    name: profile.name,
    instagram: profile.instagram,
    tiktok: profile.tiktok,
    whatsapp: profile.whatsapp
  };
  if (profile.photoData) changes.photoData = profile.photoData;
  if (existing.role === "kol") {
    const instagramChanged = existing.instagram !== profile.instagram;
    const tiktokChanged = existing.tiktok !== profile.tiktok;
    const legacyStatus = existing.instagramVerificationStatus === undefined
      && existing.tiktokVerificationStatus === undefined
      ? existing.verificationStatus
      : "";
    const instagramStatus = instagramChanged
      ? "not_requested"
      : existing.instagramVerificationStatus
        || (legacyStatus && profile.instagram ? legacyStatus : "not_requested");
    const tiktokStatus = tiktokChanged
      ? "not_requested"
      : existing.tiktokVerificationStatus
        || (legacyStatus && profile.tiktok ? legacyStatus : "not_requested");
    changes.instagramVerificationStatus = instagramStatus;
    changes.tiktokVerificationStatus = tiktokStatus;
    changes.verificationStatus = instagramStatus === "approved" || tiktokStatus === "approved"
      ? "approved"
      : instagramStatus === "pending" || tiktokStatus === "pending"
        ? "pending"
        : instagramStatus === "rejected" || tiktokStatus === "rejected" ? "rejected" : "not_requested";
  }
  await updateDoc(userRef, changes);
  if (auth.currentUser?.uid === uid) await updateProfile(auth.currentUser, { displayName: profile.name });
}

export async function submitVerificationRequestCloud(uid, platform, notification) {
  requireFirebase();
  if (!["instagram", "tiktok"].includes(platform)) throw new Error("Platform verifikasi tidak valid.");
  const userRef = doc(db, "users", uid);
  await runTransaction(db, async transaction => {
    const userSnapshot = await transaction.get(userRef);
    if (!userSnapshot.exists()) throw new Error("Profil KOL tidak ditemukan.");
    const user = userSnapshot.data();
    const statusField = `${platform}VerificationStatus`;
    const legacyStatus = user.instagramVerificationStatus === undefined
      && user.tiktokVerificationStatus === undefined
      && typeof user[platform] === "string"
      && user[platform].length > 0;
    const currentStatus = user[statusField]
      || (legacyStatus ? user.verificationStatus : "not_requested");
    if (currentStatus === "pending" || currentStatus === "approved") {
      throw new Error("Tautan ini sudah dikonfirmasi atau menunggu pemeriksaan admin.");
    }
    const hasApprovedLink = user.instagramVerificationStatus === "approved"
      || user.tiktokVerificationStatus === "approved"
      || (
        user.instagramVerificationStatus === undefined
        && user.tiktokVerificationStatus === undefined
        && user.verificationStatus === "approved"
      );
    const requestedAt = Date.now();
    transaction.update(userRef, {
      [statusField]: "pending",
      [`${platform}VerificationRequestedAt`]: requestedAt,
      verificationRequestedAt: requestedAt,
      verificationStatus: hasApprovedLink ? "approved" : "pending"
    });
    transaction.set(doc(db, "notifications", notification.id), notification);
  });
}

export async function reviewVerificationRequestCloud(uid, platform, status, notification) {
  requireFirebase();
  if (!["instagram", "tiktok"].includes(platform)) throw new Error("Platform verifikasi tidak valid.");
  if (!["approved", "rejected"].includes(status)) throw new Error("Status verifikasi tidak valid.");
  const userRef = doc(db, "users", uid);
  await runTransaction(db, async transaction => {
    const userSnapshot = await transaction.get(userRef);
    if (!userSnapshot.exists()) throw new Error("Profil KOL tidak ditemukan.");
    const user = userSnapshot.data();
    const statusField = `${platform}VerificationStatus`;
    const legacyPending = user[statusField] === undefined
      && user.instagramVerificationStatus === undefined
      && user.tiktokVerificationStatus === undefined
      && user.verificationStatus === "pending"
      && typeof user[platform] === "string"
      && user[platform].length > 0;
    if (user[statusField] !== "pending" && !legacyPending) throw new Error("Konfirmasi tautan ini sudah ditinjau.");
    const otherPlatform = platform === "instagram" ? "tiktok" : "instagram";
    const otherStatus = user[`${otherPlatform}VerificationStatus`] || "not_requested";
    const aggregateStatus = status === "approved"
      ? "approved"
      : otherStatus === "approved"
        ? "approved"
        : otherStatus === "pending" ? "pending" : "rejected";
    transaction.update(userRef, {
      [statusField]: status,
      [`${platform}VerificationReviewedAt`]: Date.now(),
      verificationStatus: aggregateStatus,
      verificationReviewedAt: Date.now()
    });
    transaction.set(doc(db, "notifications", notification.id), notification);
  });
}

export async function createTopupRequestCloud(request, notification) {
  requireFirebase();
  const requestRef = doc(collection(db, "topupRequests"));
  const receiptRef = doc(db, "topupRequests", requestRef.id, "private", "receipt");
  const displayId = `${requestRef.id}-${request.brandName}`;
  const batch = writeBatch(db);
  batch.set(requestRef, {
    ownerUid: request.ownerUid,
    brandName: request.brandName,
    email: request.email,
    amount: request.amount,
    method: "Transfer bank",
    displayId,
    createdAt: request.createdAt,
    id: requestRef.id,
    status: "pending"
  });
  batch.set(receiptRef, { receiptData: request.receiptData });
  batch.set(doc(db, "notifications", notification.id), { ...notification, topupRequestId: requestRef.id });
  await batch.commit();
  return {
    ownerUid: request.ownerUid,
    brandName: request.brandName,
    email: request.email,
    amount: request.amount,
    method: "Transfer bank",
    displayId,
    createdAt: request.createdAt,
    id: requestRef.id,
    status: "pending"
  };
}

export async function getTopupReceiptCloud(requestId) {
  requireFirebase();
  const receiptSnapshot = await getDoc(doc(db, "topupRequests", requestId, "private", "receipt"));
  if (!receiptSnapshot.exists()) throw new Error("Bukti pembayaran tidak ditemukan.");
  const receiptData = receiptSnapshot.data().receiptData;
  if (typeof receiptData !== "string" || !receiptData.startsWith("data:image/jpeg;base64,")) {
    throw new Error("Format bukti pembayaran tidak valid.");
  }
  return receiptData;
}

export async function getTopupReceiptUrlCloud(path) {
  requireFirebase();
  return getDownloadURL(storageRef(storage, path));
}

export async function reviewTopupRequestCloud(requestId, status, notification) {
  requireFirebase();
  if (!["approved", "rejected"].includes(status)) throw new Error("Status top up tidak valid.");
  const requestRef = doc(db, "topupRequests", requestId);
  return runTransaction(db, async transaction => {
    const requestSnapshot = await transaction.get(requestRef);
    if (!requestSnapshot.exists()) throw new Error("Pengajuan top up tidak ditemukan.");
    const topup = requestSnapshot.data();
    if (topup.status !== "pending") throw new Error("Pengajuan top up ini sudah ditinjau.");
    const userRef = doc(db, "users", topup.ownerUid);
    const userSnapshot = await transaction.get(userRef);
    if (!userSnapshot.exists()) throw new Error("Profil brand tidak ditemukan.");
    transaction.update(requestRef, {
      status,
      reviewedAt: Date.now(),
      reviewedBy: auth.currentUser.uid
    });
    if (status === "approved") {
      transaction.update(userRef, {
        balance: (Number(userSnapshot.data().balance) || 0) + CAMPAIGN_CREATION_COST,
        lastApprovedTopupId: requestId
      });
    }
    transaction.set(doc(db, "notifications", notification.id), {
      ...notification,
      topupRequestId: requestId
    });
    return {
      ...topup,
      id: requestId,
      status,
      reviewedAt: Date.now(),
      balance: status === "approved"
        ? (Number(userSnapshot.data().balance) || 0) + CAMPAIGN_CREATION_COST
        : Number(userSnapshot.data().balance) || 0
    };
  });
}

export function subscribeUserProfileCloud(uid, onProfile, onError) {
  requireFirebase();
  return onSnapshot(doc(db, "users", uid), snapshot => {
    if (!snapshot.exists()) {
      onError(new Error("Profil pengguna tidak ditemukan."));
      return;
    }
    onProfile(snapshot.data());
  }, onError);
}

export async function loadCloudState(user, role) {
  requireFirebase();
  const applicationCollection = collection(db, "applications");
  const applicationQuery = role === "admin"
    ? applicationCollection
    : query(applicationCollection, where(role === "brand" ? "ownerUid" : "applicantUid", "==", user.uid));
  const notificationCollection = collection(db, "notifications");
  const notificationQuery = role === "admin"
    ? notificationCollection
    : query(notificationCollection, where("recipientUid", "==", user.uid));
  const topupCollection = collection(db, "topupRequests");
  const topupQuery = role === "admin"
    ? topupCollection
    : query(topupCollection, where("ownerUid", "==", user.uid));
  const programRequest = getDocs(collection(db, "campaignPrograms"));
  const userRequest = role === "admin"
    ? getDocs(collection(db, "users"))
    : getDoc(doc(db, "users", user.uid));

  const [campaignSnapshots, applicationSnapshots, notificationSnapshots, topupSnapshots, programSnapshots, userSnapshot] = await Promise.all([
    getDocs(collection(db, "campaigns")),
    getDocs(applicationQuery),
    getDocs(notificationQuery),
    getDocs(topupQuery),
    programRequest,
    userRequest
  ]);
  const campaigns = campaignSnapshots.docs.map(snapshot => ({
    id: snapshot.id,
    ...snapshot.data(),
    applicants: []
  }));

  const applications = applicationSnapshots.docs.map(snapshot => ({ id: snapshot.id, ...snapshot.data() }));
  for (const application of applications) {
    const campaign = campaigns.find(item => item.id === application.campaignId);
    if (campaign) campaign.applicants.push(application);
  }

  const notifications = notificationSnapshots.docs.map(snapshot => ({ id: snapshot.id, ...snapshot.data() }));
  const topupRequests = topupSnapshots.docs.map(snapshot => ({ id: snapshot.id, ...snapshot.data() }));

  let users = [];
  if (role === "admin") {
    users = userSnapshot.docs.map(snapshot => ({ uid: snapshot.id, ...snapshot.data() }));
  } else {
    if (!userSnapshot.exists()) throw new Error("Profil pengguna tidak ditemukan.");
    users = [{ uid: userSnapshot.id, ...userSnapshot.data() }];
  }
  const specialPrograms = [
    { id: "umkm", name: "Bantu UMKM", description: "Campaign spesial untuk membantu UMKM.", active: true },
    ...programSnapshots.docs
      .filter(snapshot => snapshot.id !== "umkm")
      .map(snapshot => ({ id: snapshot.id, ...snapshot.data() }))
  ];
  return { users, campaigns, notifications, applications, specialPrograms, topupRequests };
}

export function subscribeNotificationsCloud(uid, onNotifications, onError, role) {
  requireFirebase();
  const notificationsQuery = role === "admin"
    ? query(collection(db, "notifications"), where("event", "in", ["verification_requested", "topup_submitted"]))
    : query(collection(db, "notifications"), where("recipientUid", "==", uid));
  return onSnapshot(
    notificationsQuery,
    snapshot => onNotifications(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))),
    onError
  );
}

export function subscribeCampaignProgramsCloud(onPrograms, onError) {
  requireFirebase();
  return onSnapshot(collection(db, "campaignPrograms"), snapshot => {
    onPrograms(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
  }, onError);
}

export function subscribeTopupRequestsCloud(uid, role, onRequests, onError) {
  requireFirebase();
  const requestsQuery = role === "admin"
    ? collection(db, "topupRequests")
    : query(collection(db, "topupRequests"), where("ownerUid", "==", uid));
  return onSnapshot(requestsQuery, snapshot => {
    onRequests(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
  }, onError);
}

export async function createCampaignProgramCloud(name, description) {
  requireFirebase();
  const programRef = doc(collection(db, "campaignPrograms"));
  const program = {
    name,
    description,
    createdAt: Date.now(),
    active: true
  };
  await setDoc(programRef, program);
  return { id: programRef.id, ...program };
}

export async function createCampaignCloud(campaign, user) {
  requireFirebase();
  const { ownerEmail, applicants, ...publicCampaign } = campaign;
  const userRef = doc(db, "users", user.uid);
  const campaignRef = doc(db, "campaigns", campaign.id);
  return runTransaction(db, async transaction => {
    const [userSnapshot, campaignSnapshot] = await Promise.all([
      transaction.get(userRef),
      transaction.get(campaignRef)
    ]);
    if (!userSnapshot.exists()) throw new Error("Profil brand tidak ditemukan.");
    if (campaignSnapshot.exists()) throw new Error("ID campaign sudah digunakan. Coba simpan kembali.");
    const balance = Number(userSnapshot.data().balance) || 0;
    if (balance < CAMPAIGN_CREATION_COST) throw new Error("Saldo tidak cukup. Top up saldo Rp100.000 untuk membuat campaign.");
    transaction.update(userRef, {
      balance: balance - CAMPAIGN_CREATION_COST,
      lastCampaignChargeId: campaign.id
    });
    transaction.set(campaignRef, {
      ...publicCampaign,
      ownerUid: user.uid,
      applicantsCount: 0
    });
    return balance - CAMPAIGN_CREATION_COST;
  });
}

export async function updateCampaignCloud(campaignId, changes) {
  requireFirebase();
  await updateDoc(doc(db, "campaigns", campaignId), {
    brandName: changes.brandName,
    type: changes.type,
    title: changes.title,
    description: changes.description,
    terms: changes.terms,
    fee: changes.fee,
    cpm: changes.cpm || 0,
    videoCount: changes.videoCount,
    reward: changes.reward,
    banner: changes.banner,
    specialProgram: changes.specialProgram || ""
  });
}

export async function updateCampaignTermsCloud(campaignId, terms) {
  requireFirebase();
  await updateDoc(doc(db, "campaigns", campaignId), { terms });
}

export async function submitApplicationCloud(campaign, application, applicantUid) {
  requireFirebase();
  const campaignRef = doc(db, "campaigns", campaign.id);
  const userRef = doc(db, "users", applicantUid);
  const applicationRef = doc(db, "applications", `${campaign.id}_${applicantUid}`);
  await runTransaction(db, async transaction => {
    const [campaignSnapshot, applicationSnapshot, userSnapshot] = await Promise.all([
      transaction.get(campaignRef),
      transaction.get(applicationRef),
      transaction.get(userRef)
    ]);
    if (!campaignSnapshot.exists()) throw new Error("Campaign tidak ditemukan.");
    if (applicationSnapshot.exists()) throw new Error("Kamu sudah mengajukan campaign ini.");
    if (!userSnapshot.exists()) throw new Error("Profil KOL tidak ditemukan.");
    const campaignData = campaignSnapshot.data();
    if ((campaignData.applicantsCount || 0) >= (campaignData.slots || 5)) {
      throw new Error("Maaf, slot campaign sudah penuh.");
    }
    const userData = userSnapshot.data();
    if (userData.role !== "kol") {
      throw new Error("Hanya akun KOL yang dapat mengajukan campaign.");
    }
    if (campaignData.type === "special") {
      const hasApprovedSocial = userData.instagramVerificationStatus === "approved"
        || userData.tiktokVerificationStatus === "approved"
        || (
          userData.instagramVerificationStatus === undefined
          && userData.tiktokVerificationStatus === undefined
          && userData.verificationStatus === "approved"
        );
      const hasSocialLink = Boolean(userData.instagram || userData.tiktok);
      if (
        userData.verificationStatus !== "approved"
        || !userData.name
        || !userData.photoData
        || !hasSocialLink
        || !hasApprovedSocial
        || userData.regularApplicationCompleted !== true
      ) {
        throw new Error("Campaign Spesial hanya bisa diajukan setelah profil KOL terverifikasi 100%.");
      }
    }
    if (campaignData.type === "regular" && userData.regularApplicationCompleted !== true) {
      transaction.update(userRef, {
        regularApplicationCompleted: true,
        regularApplicationCampaignId: campaign.id
      });
    }
    transaction.set(applicationRef, {
      ...application,
      campaignId: campaign.id,
      campaignTitle: campaign.title,
      brandName: campaign.brandName,
      ownerUid: campaign.ownerUid,
      applicantUid
    });
    transaction.update(campaignRef, { applicantsCount: increment(1) });
  });
}

export async function updateApplicationCloud(application, status) {
  requireFirebase();
  await updateDoc(doc(db, "applications", application.id), { status });
}

export async function markRegularApplicationCompletedCloud(uid, campaignId) {
  requireFirebase();
  if (!uid || !campaignId) throw new Error("Data pengajuan Regular tidak lengkap.");
  await updateDoc(doc(db, "users", uid), {
    regularApplicationCompleted: true,
    regularApplicationCampaignId: campaignId
  });
}

export async function ensureConversationCloud(application) {
  requireFirebase();
  if (application.status !== "Diterima") throw new Error("Chat hanya tersedia setelah pengajuan di-ACC.");
  const conversation = {
    applicationId: application.id,
    campaignId: application.campaignId,
    campaignTitle: application.campaignTitle,
    brandUid: application.ownerUid,
    brandName: application.brandName,
    kolUid: application.applicantUid,
    kolName: application.name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastMessage: "",
    unreadForBrand: 0,
    unreadForKol: 0
  };
  await setDoc(doc(db, "conversations", application.id), conversation, { merge: true });
  return { id: application.id, ...conversation };
}

export function subscribeConversationsCloud(uid, role, onConversations, onError) {
  requireFirebase();
  const field = role === "brand" ? "brandUid" : "kolUid";
  return onSnapshot(
    query(collection(db, "conversations"), where(field, "==", uid)),
    snapshot => onConversations(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))),
    onError
  );
}

export function subscribeMessagesCloud(conversationId, onMessages, onError) {
  requireFirebase();
  return onSnapshot(
    query(collection(db, "conversations", conversationId, "messages")),
    snapshot => onMessages(snapshot.docs.map(item => ({ id: item.id, ...item.data() })).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))),
    onError
  );
}

export async function sendChatMessageCloud(conversation, sender, text) {
  requireFirebase();
  const message = {
    senderUid: sender.uid,
    senderName: sender.name || sender.email,
    text,
    createdAt: Date.now()
  };
  const messageRef = doc(collection(db, "conversations", conversation.id, "messages"));
  const conversationRef = doc(db, "conversations", conversation.id);
  const recipientKey = sender.uid === conversation.brandUid ? "unreadForKol" : "unreadForBrand";
  const batch = writeBatch(db);
  batch.set(messageRef, message);
  batch.update(conversationRef, {
    lastMessage: text,
    lastMessageAt: message.createdAt,
    updatedAt: message.createdAt,
    [recipientKey]: increment(1)
  });
  await batch.commit();
  return { id: messageRef.id, ...message };
}

export async function markConversationReadCloud(conversationId, role) {
  requireFirebase();
  await updateDoc(doc(db, "conversations", conversationId), {
    [role === "brand" ? "unreadForBrand" : "unreadForKol"]: 0
  });
}

export async function addNotificationCloud(notification) {
  requireFirebase();
  await setDoc(doc(collection(db, "notifications")), notification);
}

export async function markNotificationsReadCloud(uid, role) {
  requireFirebase();
  const notificationsQuery = role === "admin"
    ? query(collection(db, "notifications"), where("event", "in", ["verification_requested", "topup_submitted"]))
    : query(collection(db, "notifications"), where("recipientUid", "==", uid));
  const snapshots = await getDocs(notificationsQuery);
  const batch = writeBatch(db);
  snapshots.docs.filter(snapshot => !snapshot.data().read).forEach(snapshot => {
    batch.update(snapshot.ref, { read: true });
  });
  await batch.commit();
}
