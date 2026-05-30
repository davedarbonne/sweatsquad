import { useState, useEffect, useRef } from "react";
import { db } from "./firebase";
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";

const VAPID_KEY = "BObS3r8ohcb3-voKgEidcDFOnHaD8IayMPQrbaq9hEGFgus_0R7_9BfRomHU5ODLsBMJw6_F0Nc1v5CYQIz6sgA";

const BADGE_DEFS = [
  { id: "first_blood", emoji: "🔥", label: "First Rep", desc: "Log your first entry" },
  { id: "streak3", emoji: "⚡", label: "On Fire", desc: "Log 3 days in a row" },
  { id: "finisher", emoji: "🏆", label: "Finisher", desc: "Complete a challenge" },
  { id: "podium", emoji: "🥇", label: "Top Dog", desc: "Reach #1 on the leaderboard" },
  { id: "centurion", emoji: "💯", label: "Centurion", desc: "Log 100 total reps/mins/steps" },
];

const CHALLENGE_TEMPLATES = [
  { name: "30-Day Pushup Challenge", unit: "pushups", goal: 1000, emoji: "💪", durationDays: 30 },
  { name: "10K Steps Daily", unit: "steps", goal: 300000, emoji: "👟", durationDays: 30 },
  { name: "Run 50 Miles", unit: "miles", goal: 50, emoji: "🏃", durationDays: 30 },
  { name: "100 Min Plank Month", unit: "seconds", goal: 6000, emoji: "🧘", durationDays: 30 },
  { name: "Burpee Blitz", unit: "burpees", goal: 500, emoji: "🔥", durationDays: 14 },
];

function Avatar({ name, size = 36 }) {
  const colors = ["#e74c3c","#e67e22","#f1c40f","#2ecc71","#1abc9c","#3498db","#9b59b6","#e91e63"];
  const idx = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length;
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", background: colors[idx],
      display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: 800, fontSize: size * 0.4, color: "#fff", flexShrink: 0,
      fontFamily: "'Bebas Neue', cursive", letterSpacing: 1
    }}>
      {name[0]?.toUpperCase()}
    </div>
  );
}

function BadgeChip({ badge }) {
  return (
    <div title={badge.desc} style={{
      background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
      borderRadius: 20, padding: "3px 10px", fontSize: 13, display: "flex",
      alignItems: "center", gap: 4, cursor: "default"
    }}>
      <span>{badge.emoji}</span>
      <span style={{ color: "#ccc", fontFamily: "'Space Mono', monospace", fontSize: 11 }}>{badge.label}</span>
    </div>
  );
}

function ProgressBar({ pct, color = "#f97316" }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 99, height: 8, overflow: "hidden", width: "100%" }}>
      <div style={{
        width: `${Math.min(pct, 100)}%`, height: "100%", borderRadius: 99,
        background: `linear-gradient(90deg, ${color}, #fbbf24)`,
        transition: "width 0.6s cubic-bezier(.4,0,.2,1)"
      }} />
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 11, color: "#666", fontFamily: "'Space Mono', monospace", letterSpacing: 2, marginBottom: 12 }}>
      {children}
    </div>
  );
}

const FIRESTORE_DOC = "sweatsquad/challenges";

export default function App() {
  const [screen, setScreen] = useState("home");
  const [userName, setUserName] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [challenges, setChallenges] = useState([]);
  const [selectedChallenge, setSelectedChallenge] = useState(null);
  const [logAmount, setLogAmount] = useState("");
  const [newChallenge, setNewChallenge] = useState({ name: "", unit: "", goal: "", emoji: "💪", durationDays: "", videoUrl: "", description: "" });
  const [reactionPicker, setReactionPicker] = useState(null); // message id
  const [lbReactionPicker, setLbReactionPicker] = useState(null); // leaderboard user
  const [mentionAlert, setMentionAlert] = useState(null);
  const [notifPermission, setNotifPermission] = useState(typeof Notification !== "undefined" ? Notification.permission : "default");
  const [notifBannerDismissed, setNotifBannerDismissed] = useState(() => localStorage.getItem("sweatsquad_notif_dismissed") === "true");
  const [lastSeenMentionTs, setLastSeenMentionTs] = useState(() => parseInt(localStorage.getItem("sweatsquad_lastmention") || "0"));
  const messagesEndRef = useRef(null);
  const [mentionList, setMentionList] = useState([]); // users shown in @ dropdown
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newBadges, setNewBadges] = useState([]);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [showArchive, setShowArchive] = useState(false);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [shareLog, setShareLog] = useState(null); // { challengeName, emoji, amount, unit }
  const [unreadCount, setUnreadCount] = useState(0);
  const [lastReadTs, setLastReadTs] = useState(() => parseInt(localStorage.getItem("sweatsquad_lastread") || "0"));

  // Load username from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("sweatsquad_username");
    if (saved) setUserName(saved);
  }, []);

  // Real-time listener for challenges from Firestore
  useEffect(() => {
    const ref = doc(db, "sweatsquad", "challenges");
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        setChallenges(snap.data().list || []);
      }
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);

  // Real-time chat listener
  useEffect(() => {
    const ref = doc(db, "sweatsquad", "chat");
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        const msgs = snap.data().messages || [];
        setMessages(msgs);
        const unread = msgs.filter(m => m.ts > lastReadTs && m.user !== userName).length;
        setUnreadCount(unread);
      }
    });
    return () => unsub();
  }, [lastReadTs, userName]); // eslint-disable-line

  // Request notification permission and save FCM token
  const setupNotifications = async () => {
    if (!userName) return;
    try {
      const permission = await Notification.requestPermission();
      setNotifPermission(permission);
      if (permission !== "granted") return;
      const messaging = getMessaging();
      const token = await getToken(messaging, { vapidKey: VAPID_KEY });
      if (token) {
        // Save token mapped to username in Firestore
        const { collection, addDoc, query, where, getDocs, deleteDoc } = await import("firebase/firestore");
        const tokensRef = collection(db, "fcmTokens");
        // Remove old tokens for this user+device combo
        const existing = await getDocs(query(tokensRef, where("token", "==", token)));
        existing.forEach(d => deleteDoc(d.ref));
        await addDoc(tokensRef, { username: userName, token, updatedAt: Date.now() });
      }
      // Handle foreground messages
      onMessage(messaging, (payload) => {
        const { title, body } = payload.notification;
        showToast(`🔔 ${title}: ${body}`);
      });
    } catch (err) {
      console.log("Notification setup failed:", err);
    }
  };

  // Scroll chat to bottom when screen is chat or messages change
  useEffect(() => {
    if (screen === "chat" && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [screen, messages]);

  // Show banner if someone @mentions current user
  useEffect(() => {
    if (!userName) return;
    const newMention = [...messages].reverse().find(
      m => !m.deleted && m.text && m.text.includes(`@${userName}`) && m.user !== userName && m.ts > lastSeenMentionTs
    );
    if (newMention) setMentionAlert(newMention);
  }, [messages, userName]); // eslint-disable-line

  // Update selectedChallenge in real-time when challenges change
  useEffect(() => {
    if (selectedChallenge) {
      const updated = challenges.find(c => c.id === selectedChallenge.id);
      if (updated) setSelectedChallenge(updated);
    }
  }, [challenges]); // eslint-disable-line

  const save = async (updated) => {
    const ref = doc(db, "sweatsquad", "challenges");
    await setDoc(ref, { list: updated });
  };

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSetName = () => {
    if (!nameInput.trim()) return;
    const name = nameInput.trim();
    setUserName(name);
    localStorage.setItem("sweatsquad_username", name);
    setNameInput("");
  };

  const buildLeaderboard = (ch) => {
    const map = {};
    (ch.logs || []).forEach(l => {
      map[l.user] = (map[l.user] || 0) + l.amount;
    });
    return Object.entries(map)
      .map(([user, total]) => ({ user, total, pct: Math.min(100, (total / ch.goal) * 100) }))
      .sort((a, b) => b.total - a.total);
  };

  const getUserBadges = (user, allChallenges) => {
    const earned = new Set();
    let totalLogged = 0;
    let rank1 = false;
    let everFinished = false;

    allChallenges.forEach(ch => {
      const entries = (ch.logs || []).filter(l => l.user === user);
      const total = entries.reduce((a, l) => a + l.amount, 0);
      totalLogged += total;
      if (total >= ch.goal) everFinished = true;
      const leaderboard = buildLeaderboard(ch);
      if (leaderboard[0]?.user === user && leaderboard[0]?.total > 0) rank1 = true;
      const days = [...new Set(entries.map(l => l.date))].sort();
      let streak = 1;
      for (let i = 1; i < days.length; i++) {
        const diff = (new Date(days[i]) - new Date(days[i - 1])) / 86400000;
        streak = diff === 1 ? streak + 1 : 1;
        if (streak >= 3) { earned.add("streak3"); break; }
      }
      if (entries.length > 0) earned.add("first_blood");
    });

    if (everFinished) earned.add("finisher");
    if (rank1) earned.add("podium");
    if (totalLogged >= 100) earned.add("centurion");
    return BADGE_DEFS.filter(b => earned.has(b.id));
  };

  const getPoints = (user, allChallenges) => {
    let points = 0;
    // Challenge completion points: 1st=5, 2nd=4, 3rd=3, rest=2
    allChallenges.forEach(ch => {
      const completers = [];
      const userTotals = {};
      (ch.logs || []).forEach(l => { userTotals[l.user] = (userTotals[l.user] || 0) + l.amount; });
      // Sort by first timestamp they completed (earliest = higher rank)
      Object.entries(userTotals).forEach(([u, total]) => {
        if (total >= ch.goal) {
          const logs = (ch.logs || []).filter(l => l.user === u);
          let running = 0;
          let completedTs = null;
          for (const log of logs.sort((a,b) => a.ts - b.ts)) {
            running += log.amount;
            if (running >= ch.goal) { completedTs = log.ts; break; }
          }
          completers.push({ user: u, completedTs });
        }
      });
      completers.sort((a, b) => a.completedTs - b.completedTs);
      const rank = completers.findIndex(c => c.user === user);
      if (rank === 0) points += 5;
      else if (rank === 1) points += 4;
      else if (rank === 2) points += 3;
      else if (rank > 2) points += 2;
    });
    // Badge points: 1 per badge
    const badges = getUserBadges(user, allChallenges);
    points += badges.length;
    return points;
  };

  const getSquadLeaderboard = (allChallenges) => {
    const users = new Set();
    allChallenges.forEach(ch => (ch.logs || []).forEach(l => users.add(l.user)));
    return [...users]
      .map(u => ({ user: u, points: getPoints(u, allChallenges) }))
      .sort((a, b) => b.points - a.points);
  };

  const getMyHistory = () => {
    const all = [];
    challenges.forEach(ch => {
      (ch.logs || [])
        .filter(l => l.user === userName)
        .forEach(l => all.push({ ...l, challengeName: ch.name, challengeEmoji: ch.emoji, unit: ch.unit, challengeId: ch.id }));
    });
    return all.sort((a, b) => b.ts - a.ts);
  };

  const handleLog = async () => {
    if (!userName) { showToast("Set your name first!", "error"); return; }
    if (isExpired(selectedChallenge)) { showToast("This challenge has ended!", "error"); return; }
    const amt = parseFloat(logAmount);
    if (!amt || amt <= 0) { showToast("Enter a valid amount", "error"); return; }

    const today = new Date().toISOString().slice(0, 10);
    const entry = { user: userName, amount: amt, date: today, ts: Date.now() };

    const prevBadges = getUserBadges(userName, challenges);
    const updated = challenges.map(ch =>
      ch.id === selectedChallenge.id ? { ...ch, logs: [...(ch.logs || []), entry] } : ch
    );
    await save(updated);

    const newB = getUserBadges(userName, updated);
    const gained = newB.filter(b => !prevBadges.find(p => p.id === b.id));
    if (gained.length) { setNewBadges(gained); setTimeout(() => setNewBadges([]), 4000); }

    setLogAmount("");
    showToast(`+${amt} ${selectedChallenge.unit} logged! 💪`);
    setShareLog({ challengeName: selectedChallenge.name, emoji: selectedChallenge.emoji, amount: amt, unit: selectedChallenge.unit });
  };

  const handleCreateChallenge = async () => {
    if (!newChallenge.name || !newChallenge.unit || !newChallenge.goal) {
      showToast("Fill all fields", "error"); return;
    }
    const ch = {
      id: Date.now().toString(),
      name: newChallenge.name,
      unit: newChallenge.unit,
      goal: parseFloat(newChallenge.goal),
      emoji: newChallenge.emoji,
      durationDays: newChallenge.durationDays ? parseInt(newChallenge.durationDays) : null,
      videoUrl: newChallenge.videoUrl || null,
      description: newChallenge.description || null,
      createdBy: userName || "Anonymous",
      createdAt: Date.now(),
      logs: [],
    };
    setNewChallenge({ name: "", unit: "", goal: "", emoji: "💪", durationDays: "", videoUrl: "", description: "" });
    setSelectedChallenge(null);
    setScreen("home");
    setShowArchive(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
    showToast("Challenge created! 🎉");
    await save([...challenges, ch]);
  };

  const handleSendMessage = async (logShare = null) => {
    if (!userName) { showToast("Set your name first!", "error"); return; }
    const text = logShare ? null : chatInput.trim();
    if (!logShare && !text) return;
    const msg = {
      id: Date.now().toString(),
      user: userName,
      ts: Date.now(),
      text: logShare ? null : text,
      logShare: logShare || null,
    };
    const ref = doc(db, "sweatsquad", "chat");
    const updated = [...messages, msg];
    await setDoc(ref, { messages: updated });
    setChatInput("");
    setShareLog(null);
  };

  const dismissMentionAlert = () => {
    if (mentionAlert) {
      const ts = mentionAlert.ts;
      setLastSeenMentionTs(ts);
      localStorage.setItem("sweatsquad_lastmention", ts.toString());
    }
    setMentionAlert(null);
  };

  const markChatRead = () => {
    const now = Date.now();
    setLastReadTs(now);
    setUnreadCount(0);
    localStorage.setItem("sweatsquad_lastread", now.toString());
  };

  const handleDeleteChallenge = async (id) => {
    const updated = challenges.filter(ch => ch.id !== id);
    await save(updated);
    setDeleteConfirm(null);
    if (screen === "challenge") { setScreen("home"); setSelectedChallenge(null); }
    showToast("Challenge deleted");
  };

  const formatDate = (dateStr) => {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const formatTs = (ts) => {
    const d = new Date(ts);
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  };

  const getEndTs = (ch) => {
    if (!ch.durationDays) return null;
    return ch.createdAt + ch.durationDays * 86400000;
  };

  const isExpired = (ch) => {
    const end = getEndTs(ch);
    return end ? Date.now() > end : false;
  };

  const isNew = (ch) => {
    return ch.createdAt && Date.now() - ch.createdAt < 86400000;
  };

  const isArchived = (ch) => {
    const allDone = buildLeaderboard(ch).every(e => e.total >= ch.goal);
    return isExpired(ch) || (allDone && buildLeaderboard(ch).length > 0);
  };

  const getCountdown = (ch) => {
    const end = getEndTs(ch);
    if (!end) return null;
    const diff = end - Date.now();
    if (diff <= 0) return "Ended";
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    if (days > 0) return `${days}d ${hours}h left`;
    const mins = Math.floor((diff % 3600000) / 60000);
    return `${hours}h ${mins}m left`;
  };

  const getYouTubeId = (url) => {
    if (!url) return null;
    const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/))([\w-]{11})/);
    return m ? m[1] : null;
  };

  const allUsers = () => {
    const users = new Set();
    challenges.forEach(ch => (ch.logs || []).forEach(l => users.add(l.user)));
    messages.forEach(m => users.add(m.user));
    if (userName) users.add(userName);
    return [...users].filter(u => u !== userName);
  };

  const handleChatInput = (val) => {
    setChatInput(val);
    const atMatch = val.match(/@(\w*)$/);
    if (atMatch) {
      const q = atMatch[1].toLowerCase();
      setMentionList(allUsers().filter(u => u.toLowerCase().startsWith(q)));
    } else {
      setMentionList([]);
    }
  };

  const insertMention = (user) => {
    const replaced = chatInput.replace(/@\w*$/, `@${user} `);
    setChatInput(replaced);
    setMentionList([]);
  };

  const handleReact = async (msgId, emoji) => {
    const ref = doc(db, "sweatsquad", "chat");
    const updated = messages.map(m => {
      if (m.id !== msgId) return m;
      const reactions = { ...(m.reactions || {}) };
      if (!reactions[emoji]) reactions[emoji] = [];
      if (reactions[emoji].includes(userName)) {
        reactions[emoji] = reactions[emoji].filter(u => u !== userName);
        if (reactions[emoji].length === 0) delete reactions[emoji];
      } else {
        reactions[emoji] = [...reactions[emoji], userName];
      }
      return { ...m, reactions };
    });
    await setDoc(ref, { messages: updated });
    setReactionPicker(null);
  };

  const handleDeleteMessage = async (msgId) => {
    const ref = doc(db, "sweatsquad", "chat");
    const updated = messages.map(m =>
      m.id === msgId ? { ...m, deleted: true, text: null, logShare: null } : m
    );
    await setDoc(ref, { messages: updated });
  };

  const handleLeaderboardReact = async (challengeId, targetUser, emoji) => {
    const updated = challenges.map(ch => {
      if (ch.id !== challengeId) return ch;
      const lbReactions = { ...(ch.lbReactions || {}) };
      if (!lbReactions[targetUser]) lbReactions[targetUser] = {};
      if (!lbReactions[targetUser][emoji]) lbReactions[targetUser][emoji] = [];
      const already = lbReactions[targetUser][emoji].includes(userName);
      if (already) {
        lbReactions[targetUser][emoji] = lbReactions[targetUser][emoji].filter(u => u !== userName);
        if (lbReactions[targetUser][emoji].length === 0) delete lbReactions[targetUser][emoji];
      } else {
        lbReactions[targetUser][emoji] = [...lbReactions[targetUser][emoji], userName];
      }
      return { ...ch, lbReactions };
    });
    await save(updated);
  };

  const navItems = [
    { label: "Challenges", icon: "🏋️", s: "home" },
    { label: "Create", icon: "➕", s: "create" },
    { label: "Chat", icon: "💬", s: "chat" },
    { label: "Points", icon: "🏆", s: "points" },
    { label: "My Stats", icon: "📊", s: "profile" },
  ];

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#0d0d0f", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ fontSize: 48 }}>🏋️</div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d0f", fontFamily: "'DM Sans', sans-serif", color: "#f0f0f0", position: "relative" }}>
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />

      <div style={{ position: "fixed", top: -100, left: "50%", transform: "translateX(-50%)", width: 600, height: 300, borderRadius: "50%", background: "radial-gradient(ellipse, rgba(249,115,22,0.15) 0%, transparent 70%)", pointerEvents: "none", zIndex: 0 }} />

      {newBadges.length > 0 && (
        <div style={{ position: "fixed", top: 80, left: "50%", transform: "translateX(-50%)", background: "linear-gradient(135deg, #1a1a1f, #2a1a00)", border: "1.5px solid #f97316", borderRadius: 16, padding: "14px 24px", zIndex: 999, textAlign: "center", boxShadow: "0 0 40px rgba(249,115,22,0.4)" }}>
          <div style={{ fontSize: 11, color: "#f97316", fontFamily: "'Space Mono', monospace", letterSpacing: 2, marginBottom: 6 }}>NEW BADGE UNLOCKED</div>
          {newBadges.map(b => <div key={b.id} style={{ fontSize: 22 }}>{b.emoji} <span style={{ fontWeight: 700 }}>{b.label}</span></div>)}
        </div>
      )}

      {toast && (
        <div style={{ position: "fixed", bottom: 90, left: "50%", transform: "translateX(-50%)", background: toast.type === "error" ? "#7f1d1d" : "#14532d", border: `1px solid ${toast.type === "error" ? "#f87171" : "#4ade80"}`, color: "#fff", borderRadius: 12, padding: "10px 20px", fontSize: 14, fontWeight: 600, zIndex: 998, whiteSpace: "nowrap" }}>{toast.msg}</div>
      )}

      {!notifBannerDismissed && notifPermission === "default" && userName && (
        <div style={{
          position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
          background: "#1a1a2e", border: "1.5px solid rgba(249,115,22,0.5)",
          borderRadius: 16, padding: "12px 16px", zIndex: 996,
          display: "flex", alignItems: "center", gap: 12,
          boxShadow: "0 4px 24px rgba(0,0,0,0.6)", maxWidth: 360, width: "calc(100% - 32px)"
        }}>
          <span style={{ fontSize: 24 }}>🔔</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Enable notifications?</div>
            <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>Get notified when someone mentions you in chat</div>
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button onClick={setupNotifications}
              style={{ background: "#f97316", border: "none", borderRadius: 8, padding: "6px 12px", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>
              Allow
            </button>
            <button onClick={() => { setNotifBannerDismissed(true); localStorage.setItem("sweatsquad_notif_dismissed", "true"); }}
              style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 20, lineHeight: 1, padding: "0 4px" }}>×</button>
          </div>
        </div>
      )}

      {mentionAlert && screen !== "chat" && (
        <div style={{
          position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
          background: "#1a1a2e", border: "1.5px solid #f97316",
          borderRadius: 16, padding: "12px 16px", zIndex: 997,
          display: "flex", alignItems: "center", gap: 12,
          boxShadow: "0 4px 24px rgba(0,0,0,0.6)", maxWidth: 360, width: "calc(100% - 32px)"
        }}>
          <Avatar name={mentionAlert.user} size={32} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: "#f97316", fontWeight: 700 }}>{mentionAlert.user} mentioned you 👋</div>
            <div style={{ fontSize: 13, color: "#ccc", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{mentionAlert.text}</div>
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button onClick={() => { setScreen("chat"); setSelectedChallenge(null); markChatRead(); dismissMentionAlert(); }}
              style={{ background: "#f97316", border: "none", borderRadius: 8, padding: "6px 12px", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>
              View
            </button>
            <button onClick={dismissMentionAlert}
              style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 20, lineHeight: 1, padding: "0 4px" }}>×</button>
          </div>
        </div>
      )}

      {shareLog && (
        <div style={{ position: "fixed", bottom: 90, left: "50%", transform: "translateX(-50%)", background: "#1a1a2e", border: "1px solid rgba(249,115,22,0.4)", borderRadius: 16, padding: "14px 18px", zIndex: 997, display: "flex", alignItems: "center", gap: 12, boxShadow: "0 4px 24px rgba(0,0,0,0.5)", minWidth: 280 }}>
          <div style={{ fontSize: 22 }}>{shareLog.emoji}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Share to chat?</div>
            <div style={{ fontSize: 12, color: "#888" }}>+{shareLog.amount} {shareLog.unit} — {shareLog.challengeName}</div>
          </div>
          <button onClick={() => handleSendMessage(shareLog)} style={{ background: "#f97316", border: "none", borderRadius: 8, padding: "6px 12px", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>Share</button>
          <button onClick={() => setShareLog(null)} style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
      )}

      {deleteConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 990, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "#1a1a1f", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 20, padding: 28, maxWidth: 340, width: "100%", textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🗑️</div>
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Delete this challenge?</div>
            <div style={{ color: "#888", fontSize: 14, marginBottom: 24 }}>"{challenges.find(c => c.id === deleteConfirm)?.name}" and all its logs will be permanently removed.</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setDeleteConfirm(null)} style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: 12, color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 15 }}>Cancel</button>
              <button onClick={() => handleDeleteChallenge(deleteConfirm)} style={{ flex: 1, background: "#ef4444", border: "none", borderRadius: 12, padding: 12, color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 15 }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "0 16px 90px", position: "relative", zIndex: 1 }}>

        <div style={{ paddingTop: 28, paddingBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 34, letterSpacing: 2, lineHeight: 1, color: "#fff" }}>SWEAT<span style={{ color: "#f97316" }}>SQUAD</span></div>
            <div style={{ fontSize: 12, color: "#666", fontFamily: "'Space Mono', monospace", marginTop: 2 }}>CHALLENGE YOUR CREW</div>
          </div>
          {userName && <Avatar name={userName} size={42} />}
        </div>

        {!userName && (
          <div style={{ background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.3)", borderRadius: 16, padding: 20, marginBottom: 20 }}>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>Who are you? 👋</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={nameInput} onChange={e => setNameInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSetName()} placeholder="Your name..."
                style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, padding: "10px 14px", color: "#fff", fontSize: 15, outline: "none" }} />
              <button onClick={handleSetName} style={{ background: "#f97316", border: "none", borderRadius: 10, padding: "10px 18px", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 15 }}>Go</button>
            </div>
          </div>
        )}

        {screen === "challenge" && (
          <button onClick={() => { setScreen("home"); setSelectedChallenge(null); }} style={{ background: "none", border: "none", color: "#f97316", cursor: "pointer", fontSize: 14, fontWeight: 600, padding: "4px 0", marginBottom: 12, display: "flex", alignItems: "center", gap: 4 }}>
            ← Back
          </button>
        )}

        {/* HOME */}
        {screen === "home" && (
          <div>
            {userName && (() => {
              const badges = getUserBadges(userName, challenges);
              return badges.length > 0 ? (
                <div style={{ marginBottom: 20 }}>
                  <SectionLabel>YOUR BADGES</SectionLabel>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{badges.map(b => <BadgeChip key={b.id} badge={b} />)}</div>
                </div>
              ) : null;
            })()}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <SectionLabel>{showArchive ? "ARCHIVED CHALLENGES" : "ACTIVE CHALLENGES"}</SectionLabel>
              <div style={{ display: "flex", gap: 8 }}>
                {challenges.some(ch => isArchived(ch)) && (
                  <button onClick={() => setShowArchive(a => !a)} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "8px 12px", color: showArchive ? "#f97316" : "#aaa", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>
                    {showArchive ? "← Active" : "Archive 📦"}
                  </button>
                )}
                {!showArchive && <button onClick={() => setScreen("create")} style={{ background: "#f97316", border: "none", borderRadius: 10, padding: "8px 16px", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>+ New</button>}
              </div>
            </div>
            {(() => {
              const sorted = [...challenges].sort((a, b) => b.createdAt - a.createdAt);
              const displayed = sorted.filter(ch => showArchive ? isArchived(ch) : !isArchived(ch));
              if (displayed.length === 0) return (
                <div style={{ textAlign: "center", padding: "60px 0", color: "#555" }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>{showArchive ? "📦" : "🏋️"}</div>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>{showArchive ? "No archived challenges" : "No active challenges"}</div>
                  <div style={{ fontSize: 14 }}>{showArchive ? "Finished challenges will appear here" : "Create the first one for your squad!"}</div>
                </div>
              );
              return displayed.map(ch => {
                const lb = buildLeaderboard(ch);
                const myEntry = lb.find(e => e.user === userName);
                const myTotal = myEntry?.total || 0;
                const pct = Math.min(100, (myTotal / ch.goal) * 100);
                const newChallenge = isNew(ch);
                return (
                  <div key={ch.id} style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${newChallenge ? "rgba(249,115,22,0.35)" : "rgba(255,255,255,0.08)"}`, borderRadius: 18, padding: 18, marginBottom: 12, position: "relative", opacity: showArchive ? 0.75 : 1 }}>
                    {newChallenge && (
                      <div style={{ position: "absolute", top: -10, left: 16, background: "linear-gradient(90deg, #f97316, #fbbf24)", borderRadius: 99, padding: "2px 10px", fontSize: 10, fontWeight: 900, color: "#fff", fontFamily: "'Space Mono', monospace", letterSpacing: 1 }}>✨ NEW</div>
                    )}
                    <button onClick={e => { e.stopPropagation(); setDeleteConfirm(ch.id); }} title="Delete challenge"
                      style={{ position: "absolute", top: 14, right: 14, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, padding: "4px 8px", color: "#ef4444", cursor: "pointer", fontSize: 13, lineHeight: 1 }}>🗑</button>
                    <div onClick={() => { setSelectedChallenge(ch); setScreen("challenge"); }} style={{ cursor: "pointer" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12, paddingRight: 36 }}>
                        <div style={{ fontSize: 28 }}>{ch.emoji}</div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 15 }}>{ch.name}</div>
                          <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>Goal: {ch.goal.toLocaleString()} {ch.unit}</div>
              {ch.videoUrl && getYouTubeId(ch.videoUrl) && (
                <div style={{ borderRadius: 14, overflow: "hidden", marginBottom: 20, position: "relative", paddingBottom: "56.25%", height: 0 }}>
                  <iframe
                    src={`https://www.youtube.com/embed/${getYouTubeId(ch.videoUrl)}`}
                    title="Instructional Video"
                    style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: "none" }}
                    allowFullScreen
                  />
                </div>
              )}
              {getCountdown(ch) && (
                            <div style={{ fontSize: 11, marginTop: 4, fontFamily: "'Space Mono', monospace", color: isExpired(ch) ? "#ef4444" : "#f97316", fontWeight: 700 }}>
                              {isExpired(ch) ? "🔴 ENDED" : `⏱ ${getCountdown(ch)}`}
                            </div>
                          )}
                        </div>
                        <div style={{ marginLeft: "auto", fontFamily: "'Space Mono', monospace", fontSize: 12, color: "#f97316", fontWeight: 700 }}>{Math.round(pct)}%</div>
                      </div>
                      <ProgressBar pct={pct} />
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 12, color: "#666" }}>
                        <span>{lb.length} participant{lb.length !== 1 ? "s" : ""}</span>
                        <span>{lb[0] ? `🥇 ${lb[0].user}` : "No entries yet"}</span>
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        )}

        {/* CHALLENGE DETAIL */}
        {screen === "challenge" && selectedChallenge && (() => {
          const ch = challenges.find(c => c.id === selectedChallenge.id) || selectedChallenge;
          const lb = buildLeaderboard(ch);
          const myEntry = lb.find(e => e.user === userName);
          const myTotal = myEntry?.total || 0;
          const myPct = Math.min(100, (myTotal / ch.goal) * 100);
          const completed = myTotal >= ch.goal;
          return (
            <div>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
                <div style={{ textAlign: "center", flex: 1 }}>
                  <div style={{ fontSize: 52, marginBottom: 6 }}>{completed ? "🏆" : ch.emoji}</div>
                  <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 28, letterSpacing: 2 }}>{ch.name}</div>
                  <div style={{ fontSize: 13, color: "#888", marginTop: 4 }}>Goal: {ch.goal.toLocaleString()} {ch.unit}</div>
                </div>
                <button onClick={() => setDeleteConfirm(ch.id)} style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, padding: "8px 10px", color: "#ef4444", cursor: "pointer", fontSize: 16, flexShrink: 0 }}>🗑</button>
              </div>
              {ch.description && (
                <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 16, marginBottom: 16, fontSize: 14, color: "#ccc", lineHeight: 1.6 }}>
                  <div style={{ fontSize: 11, color: "#666", fontFamily: "'Space Mono', monospace", letterSpacing: 2, marginBottom: 8 }}>DESCRIPTION</div>
                  {ch.description}
                </div>
              )}
              {getCountdown(ch) && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 16, background: isExpired(ch) ? "rgba(239,68,68,0.08)" : "rgba(249,115,22,0.07)", border: `1px solid ${isExpired(ch) ? "rgba(239,68,68,0.3)" : "rgba(249,115,22,0.2)"}`, borderRadius: 12, padding: "10px 16px" }}>
                  <span style={{ fontSize: 16 }}>{isExpired(ch) ? "🔴" : "⏱"}</span>
                  <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 13, fontWeight: 700, color: isExpired(ch) ? "#ef4444" : "#f97316" }}>
                    {isExpired(ch) ? "CHALLENGE ENDED" : getCountdown(ch).toUpperCase()}
                  </span>
                </div>
              )}
              {!completed && !isExpired(ch) && (
                <div style={{ background: "rgba(249,115,22,0.07)", border: "1px solid rgba(249,115,22,0.25)", borderRadius: 16, padding: 18, marginBottom: 20 }}>
                  <div style={{ fontWeight: 700, marginBottom: 12 }}>Log Your Progress</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input type="number" value={logAmount} onChange={e => setLogAmount(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLog()} placeholder={`${ch.unit}...`}
                      style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, padding: "10px 14px", color: "#fff", fontSize: 15, outline: "none" }} />
                    <button onClick={handleLog} style={{ background: "#f97316", border: "none", borderRadius: 10, padding: "10px 20px", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 15 }}>Log</button>
                  </div>
                </div>
              )}
              {isExpired(ch) && !completed && (
                <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 16, padding: 18, marginBottom: 20, textAlign: "center" }}>
                  <div style={{ fontSize: 22, marginBottom: 4 }}>⏰</div>
                  <div style={{ fontWeight: 700, color: "#ef4444" }}>Time's Up!</div>
                  <div style={{ fontSize: 13, color: "#888", marginTop: 4 }}>This challenge has ended. Final standings are locked in.</div>
                </div>
              )}
              {completed && (
                <div style={{ background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.3)", borderRadius: 16, padding: 18, marginBottom: 20, textAlign: "center" }}>
                  <div style={{ fontSize: 24, marginBottom: 4 }}>🎉</div>
                  <div style={{ fontWeight: 700, color: "#4ade80" }}>Challenge Complete!</div>
                  <div style={{ fontSize: 13, color: "#888", marginTop: 4 }}>You crushed it, {userName}!</div>
                </div>
              )}
              <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 18, marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                  <div style={{ fontWeight: 700 }}>Your Progress</div>
                  <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 13, color: "#f97316" }}>{myTotal.toLocaleString()} / {ch.goal.toLocaleString()}</div>
                </div>
                <ProgressBar pct={myPct} color={completed ? "#4ade80" : "#f97316"} />
              </div>
              <SectionLabel>LEADERBOARD</SectionLabel>
              {lb.length === 0 && <div style={{ color: "#555", fontSize: 14 }}>No entries yet. Be the first!</div>}
              {lb.map((entry, i) => {
                const lbReactions = ch.lbReactions?.[entry.user] || {};
                const hasReactions = Object.keys(lbReactions).length > 0;
                return (
                <div key={entry.user} style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, background: entry.user === userName ? "rgba(249,115,22,0.08)" : "rgba(255,255,255,0.03)", border: `1px solid ${entry.user === userName ? "rgba(249,115,22,0.3)" : "rgba(255,255,255,0.06)"}`, borderRadius: 12, padding: "12px 14px" }}>
                    <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 20, color: i === 0 ? "#fbbf24" : i === 1 ? "#94a3b8" : i === 2 ? "#cd7c32" : "#555", width: 24, textAlign: "center" }}>
                      {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                    </div>
                    <Avatar name={entry.user} size={34} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{entry.user}{entry.user === userName ? " (you)" : ""}</div>
                      <div style={{ marginTop: 4 }}><ProgressBar pct={entry.pct} color={i === 0 ? "#fbbf24" : "#f97316"} /></div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: "#aaa", textAlign: "right" }}>
                        <div style={{ fontWeight: 700, color: "#fff" }}>{entry.total.toLocaleString()}</div>
                        <div style={{ fontSize: 10 }}>{ch.unit}</div>
                      </div>
                      <div style={{ position: "relative" }}>
                        <button onClick={() => setLbReactionPicker(lbReactionPicker === entry.user ? null : entry.user)}
                          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "4px 8px", cursor: "pointer", fontSize: 14, color: "#aaa" }}>
                          😊
                        </button>
                        {lbReactionPicker === entry.user && (
                          <div style={{ position: "absolute", bottom: "100%", right: 0, background: "#1a1a1f", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 12, padding: "6px 8px", display: "flex", gap: 4, zIndex: 50, marginBottom: 4, whiteSpace: "nowrap" }}>
                            {["🔥","💪","😂","🥇","👀","❤️","🤯","👏"].map(e => (
                              <button key={e} onClick={() => handleLeaderboardReact(ch.id, entry.user, e)}
                                style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", padding: "2px 4px", borderRadius: 6 }}>
                                {e}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  {hasReactions && (
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4, paddingLeft: 8 }}>
                      {Object.entries(lbReactions).map(([emoji, users]) => (
                        <button key={emoji} onClick={() => handleLeaderboardReact(ch.id, entry.user, emoji)}
                          style={{ background: users.includes(userName) ? "rgba(249,115,22,0.2)" : "rgba(255,255,255,0.06)", border: `1px solid ${users.includes(userName) ? "rgba(249,115,22,0.4)" : "rgba(255,255,255,0.1)"}`, borderRadius: 99, padding: "2px 8px", fontSize: 13, cursor: "pointer", color: "#fff", display: "flex", alignItems: "center", gap: 4 }}>
                          {emoji} <span style={{ fontSize: 11, color: "#aaa" }}>{users.length}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          );
        })()}

        {/* CREATE */}
        {screen === "create" && (
          <div>
            <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 26, letterSpacing: 2, marginBottom: 20 }}>NEW CHALLENGE</div>
            <SectionLabel>QUICK START</SectionLabel>
            <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8, marginBottom: 20 }}>
              {CHALLENGE_TEMPLATES.map(t => (
                <button key={t.name} onClick={() => setNewChallenge({ name: t.name, unit: t.unit, goal: t.goal, emoji: t.emoji, durationDays: t.durationDays || "" })}
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "10px 14px", color: "#fff", cursor: "pointer", whiteSpace: "nowrap", fontSize: 13, flexShrink: 0 }}>
                  {t.emoji} {t.name}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                { label: "Challenge Name", key: "name", placeholder: "e.g. 30-Day Pushup Challenge" },
                { label: "Unit", key: "unit", placeholder: "e.g. pushups, miles, steps" },
                { label: "Goal (total)", key: "goal", placeholder: "e.g. 1000", type: "number" },
                { label: "Duration (days, optional)", key: "durationDays", placeholder: "e.g. 30  —  leave blank for no limit", type: "number" },
                { label: "Emoji", key: "emoji", placeholder: "💪" },
                { label: "Instructional Video (YouTube URL, optional)", key: "videoUrl", placeholder: "https://youtube.com/watch?v=..." },
              ].map(f => (
                <div key={f.key}>
                  <div style={{ fontSize: 12, color: "#888", marginBottom: 6, fontWeight: 600 }}>{f.label}</div>
                  <input type={f.type || "text"} value={newChallenge[f.key]} onChange={e => setNewChallenge(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder}
                    style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "12px 14px", color: "#fff", fontSize: 15, outline: "none", boxSizing: "border-box" }} />
                </div>
              ))}
              <div>
                <div style={{ fontSize: 12, color: "#888", marginBottom: 6, fontWeight: 600 }}>Description (optional)</div>
                <textarea value={newChallenge.description} onChange={e => setNewChallenge(p => ({ ...p, description: e.target.value }))}
                  placeholder="e.g. Do as many pushups as you can each day. Log your daily total. Form matters!"
                  rows={3}
                  style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "12px 14px", color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }} />
              </div>
              <button onClick={handleCreateChallenge} style={{ background: "linear-gradient(135deg, #f97316, #ea580c)", border: "none", borderRadius: 12, padding: 14, color: "#fff", fontWeight: 800, cursor: "pointer", fontSize: 16, marginTop: 8, fontFamily: "'Bebas Neue', cursive", letterSpacing: 2 }}>
                LAUNCH CHALLENGE 🚀
              </button>
            </div>
          </div>
        )}

        {/* CHAT */}
        {screen === "chat" && (
          <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 140px)" }}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 26, letterSpacing: 2 }}>SQUAD CHAT 💬</div>
              <div style={{ fontSize: 12, color: "#666", fontFamily: "'Space Mono', monospace" }}>Talk trash. Celebrate wins.</div>
            </div>
            {!userName && (
              <div style={{ textAlign: "center", padding: "40px 0", color: "#555" }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>💬</div>
                <div>Set your name first to chat</div>
              </div>
            )}
            {userName && (
              <>
                {/* Messages */}
                <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, paddingBottom: 8 }}>
                  {messages.length === 0 && (
                    <div style={{ textAlign: "center", padding: "40px 0", color: "#555" }}>
                      <div style={{ fontSize: 32, marginBottom: 10 }}>👋</div>
                      <div>No messages yet — say something!</div>
                    </div>
                  )}
                  {messages.map((msg) => {
                    const isMe = msg.user === userName;
                    const isMentioned = msg.text && msg.text.includes(`@${userName}`);
                    const renderText = (text) => {
                      if (!text) return null;
                      const parts = text.split(/(@\w+)/g);
                      return parts.map((part, i) =>
                        part.startsWith("@")
                          ? <span key={i} style={{ fontWeight: 800, color: isMe ? "#fff" : "#f97316" }}>{part}</span>
                          : part
                      );
                    };
                    return (
                      <div key={msg.id} style={{ display: "flex", flexDirection: "column", alignItems: isMe ? "flex-end" : "flex-start" }}>
                        {!isMe && <div style={{ fontSize: 11, color: "#666", marginBottom: 3, marginLeft: 4, fontWeight: 600 }}>{msg.user}</div>}
                        {msg.deleted ? (
                          <div style={{ color: "#444", fontSize: 13, fontStyle: "italic", padding: "6px 12px" }}>Message deleted</div>
                        ) : (
                        <div style={{ position: "relative" }} onClick={() => !isMe && setReactionPicker(reactionPicker === msg.id ? null : msg.id)}>
                          {isMe && (
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, justifyContent: "flex-end" }}>
                              <button onClick={() => setReactionPicker(reactionPicker === msg.id ? null : msg.id)}
                                style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 14, padding: "2px 6px" }} title="React">😊</button>
                              <button onClick={() => handleDeleteMessage(msg.id)}
                                style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 13, padding: "2px 6px" }} title="Delete">🗑</button>
                            </div>
                          )}
                          {msg.logShare ? (
                            <div style={{ background: isMe ? "rgba(249,115,22,0.15)" : "rgba(255,255,255,0.06)", border: `1px solid ${isMentioned ? "rgba(249,115,22,0.5)" : isMe ? "rgba(249,115,22,0.35)" : "rgba(255,255,255,0.1)"}`, borderRadius: 14, padding: "10px 14px", maxWidth: "80%", display: "flex", alignItems: "center", gap: 10 }}>
                              <div style={{ fontSize: 24 }}>{msg.logShare.emoji}</div>
                              <div>
                                <div style={{ fontSize: 11, color: "#888", fontFamily: "'Space Mono', monospace" }}>WORKOUT LOGGED</div>
                                <div style={{ fontWeight: 700, color: "#f97316" }}>+{msg.logShare.amount} {msg.logShare.unit}</div>
                                <div style={{ fontSize: 12, color: "#ccc" }}>{msg.logShare.challengeName}</div>
                              </div>
                            </div>
                          ) : (
                            <div style={{ background: isMentioned ? "rgba(249,115,22,0.18)" : isMe ? "#f97316" : "rgba(255,255,255,0.07)", border: isMentioned ? "1px solid rgba(249,115,22,0.5)" : "none", borderRadius: 16, borderBottomRightRadius: isMe ? 4 : 16, borderBottomLeftRadius: isMe ? 16 : 4, padding: "10px 14px", maxWidth: "75%", fontSize: 15, color: isMe ? "#fff" : "#f0f0f0", lineHeight: 1.4 }}>
                              {renderText(msg.text)}
                            </div>
                          )}
                          {reactionPicker === msg.id && (
                            <div style={{ position: "absolute", bottom: "100%", left: isMe ? "auto" : 0, right: isMe ? 0 : "auto", background: "#1a1a1f", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 12, padding: "6px 8px", display: "flex", gap: 4, zIndex: 50, marginBottom: 4 }}>
                              {["🔥","💪","😂","🥇","👀","❤️","🤯","👏"].map(e => (
                                <button key={e} onClick={() => handleReact(msg.id, e)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", padding: "2px 4px", borderRadius: 6, transition: "background 0.15s" }}
                                  onMouseEnter={ev => ev.target.style.background = "rgba(255,255,255,0.1)"}
                                  onMouseLeave={ev => ev.target.style.background = "none"}>
                                  {e}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        )}
                        {!msg.deleted && msg.reactions && Object.keys(msg.reactions).length > 0 && (
                          <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap", justifyContent: isMe ? "flex-end" : "flex-start" }}>
                            {Object.entries(msg.reactions).map(([emoji, users]) => (
                              <button key={emoji} onClick={() => handleReact(msg.id, emoji)}
                                style={{ background: users.includes(userName) ? "rgba(249,115,22,0.2)" : "rgba(255,255,255,0.06)", border: `1px solid ${users.includes(userName) ? "rgba(249,115,22,0.4)" : "rgba(255,255,255,0.1)"}`, borderRadius: 99, padding: "2px 8px", fontSize: 13, cursor: "pointer", color: "#fff", display: "flex", alignItems: "center", gap: 4 }}>
                                {emoji} <span style={{ fontSize: 11, color: "#aaa" }}>{users.length}</span>
                              </button>
                            ))}
                          </div>
                        )}
                        <div style={{ fontSize: 10, color: "#444", marginTop: 2, marginLeft: 4, marginRight: 4 }}>
                          {new Date(msg.ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
                {/* Input */}
                <div style={{ position: "relative" }}>
                  {mentionList.length > 0 && (
                    <div style={{ position: "absolute", bottom: "100%", left: 0, right: 0, background: "#1a1a1f", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 12, marginBottom: 6, overflow: "hidden", zIndex: 50 }}>
                      {mentionList.map(u => (
                        <button key={u} onClick={() => insertMention(u)} style={{ width: "100%", background: "none", border: "none", padding: "10px 16px", color: "#fff", cursor: "pointer", textAlign: "left", fontSize: 14, display: "flex", alignItems: "center", gap: 10 }}
                          onMouseEnter={e => e.currentTarget.style.background = "rgba(249,115,22,0.1)"}
                          onMouseLeave={e => e.currentTarget.style.background = "none"}>
                          <Avatar name={u} size={24} /> @{u}
                        </button>
                      ))}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                    <input
                      value={chatInput}
                      onChange={e => handleChatInput(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && mentionList.length === 0) handleSendMessage(); }}
                      placeholder="Say something... (type @ to mention)"
                      style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 24, padding: "10px 16px", color: "#fff", fontSize: 15, outline: "none" }}
                    />
                    <button onClick={() => handleSendMessage()} style={{ background: "#f97316", border: "none", borderRadius: "50%", width: 44, height: 44, color: "#fff", cursor: "pointer", fontSize: 18, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>↑</button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* POINTS / SQUAD LEADERBOARD */}
        {screen === "points" && (
          <div>
            <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 26, letterSpacing: 2, marginBottom: 4 }}>SQUAD POINTS 🏆</div>
            <div style={{ fontSize: 12, color: "#666", fontFamily: "'Space Mono', monospace", marginBottom: 20 }}>OVERALL RANKINGS</div>
            <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 16, marginBottom: 24 }}>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 12, lineHeight: 1.6 }}>
                🥇 1st to finish = <span style={{ color: "#fbbf24", fontWeight: 700 }}>5 pts</span> &nbsp;·&nbsp;
                🥈 2nd = <span style={{ color: "#94a3b8", fontWeight: 700 }}>4 pts</span> &nbsp;·&nbsp;
                🥉 3rd = <span style={{ color: "#cd7c32", fontWeight: 700 }}>3 pts</span> &nbsp;·&nbsp;
                ✅ Finisher = <span style={{ color: "#fff", fontWeight: 700 }}>2 pts</span> &nbsp;·&nbsp;
                🏅 Each badge = <span style={{ color: "#fff", fontWeight: 700 }}>1 pt</span>
              </div>
            </div>
            {(() => {
              const squad = getSquadLeaderboard(challenges);
              if (squad.length === 0) return (
                <div style={{ textAlign: "center", padding: "60px 0", color: "#555" }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🏆</div>
                  <div style={{ fontWeight: 600 }}>No points yet</div>
                  <div style={{ fontSize: 14, marginTop: 6 }}>Complete challenges to earn points!</div>
                </div>
              );
              return squad.map((entry, i) => {
                const isMe = entry.user === userName;
                const badges = getUserBadges(entry.user, challenges);
                const completedCount = challenges.filter(ch => {
                  const t = (ch.logs || []).filter(l => l.user === entry.user).reduce((a, l) => a + l.amount, 0);
                  return t >= ch.goal;
                }).length;
                return (
                  <div key={entry.user} style={{ display: "flex", alignItems: "center", gap: 12, background: isMe ? "rgba(249,115,22,0.08)" : "rgba(255,255,255,0.03)", border: `1px solid ${isMe ? "rgba(249,115,22,0.3)" : "rgba(255,255,255,0.06)"}`, borderRadius: 14, padding: "14px 16px", marginBottom: 10 }}>
                    <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 22, color: i === 0 ? "#fbbf24" : i === 1 ? "#94a3b8" : i === 2 ? "#cd7c32" : "#555", width: 28, textAlign: "center", flexShrink: 0 }}>
                      {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                    </div>
                    <Avatar name={entry.user} size={40} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{entry.user}{isMe ? " (you)" : ""}</div>
                      <div style={{ fontSize: 11, color: "#666", marginTop: 3, display: "flex", gap: 10 }}>
                        <span>✅ {completedCount} challenge{completedCount !== 1 ? "s" : ""}</span>
                        <span>🏅 {badges.length} badge{badges.length !== 1 ? "s" : ""}</span>
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 28, color: i === 0 ? "#fbbf24" : "#f97316", lineHeight: 1 }}>{entry.points}</div>
                      <div style={{ fontSize: 10, color: "#666", fontFamily: "'Space Mono', monospace" }}>PTS</div>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        )}

        {/* PROFILE / STATS */}
        {screen === "profile" && (
          <div>
            {!userName ? (
              <div style={{ textAlign: "center", padding: "60px 0", color: "#555" }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>👤</div>
                <div style={{ fontWeight: 600 }}>Set your name first to see your stats</div>
              </div>
            ) : (() => {
              const history = getMyHistory();
              const badges = getUserBadges(userName, challenges);
              const totalReps = history.reduce((a, l) => a + l.amount, 0);
              const activeChallenges = challenges.filter(ch => (ch.logs || []).filter(l => l.user === userName).reduce((a, l) => a + l.amount, 0) > 0);
              const completedChallenges = challenges.filter(ch => {
                const t = (ch.logs || []).filter(l => l.user === userName).reduce((a, l) => a + l.amount, 0);
                return t >= ch.goal;
              });
              const grouped = {};
              history.forEach(entry => {
                if (!grouped[entry.date]) grouped[entry.date] = [];
                grouped[entry.date].push(entry);
              });
              return (
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 18, padding: 20 }}>
                    <Avatar name={userName} size={56} />
                    <div>
                      <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 24, letterSpacing: 2 }}>{userName}</div>
                      <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
                        <div style={{ fontSize: 13, color: "#888" }}>{badges.length} badge{badges.length !== 1 ? "s" : ""}</div>
                        <div style={{ fontSize: 13, color: "#f97316", fontWeight: 700 }}>🏆 {getPoints(userName, challenges)} pts</div>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 24 }}>
                    {[
                      { label: "reps/units", value: totalReps.toLocaleString(), sub: "Total Logged" },
                      { label: "challenges", value: activeChallenges.length, sub: "Active" },
                      { label: "finished", value: completedChallenges.length, sub: "Completed" },
                    ].map(stat => (
                      <div key={stat.label} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "14px 10px", textAlign: "center" }}>
                        <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 26, color: "#f97316" }}>{stat.value}</div>
                        <div style={{ fontSize: 10, color: "#666", fontFamily: "'Space Mono', monospace", marginTop: 2 }}>{stat.label}</div>
                      </div>
                    ))}
                  </div>
                  {badges.length > 0 && (
                    <div style={{ marginBottom: 24 }}>
                      <SectionLabel>YOUR BADGES</SectionLabel>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{badges.map(b => <BadgeChip key={b.id} badge={b} />)}</div>
                    </div>
                  )}
                  <SectionLabel>ACTIVITY HISTORY</SectionLabel>
                  {history.length === 0 && (
                    <div style={{ textAlign: "center", padding: "40px 0", color: "#555" }}>
                      <div style={{ fontSize: 32, marginBottom: 10 }}>📋</div>
                      <div>No activity yet — go log something!</div>
                    </div>
                  )}
                  {Object.entries(grouped).map(([date, entries]) => (
                    <div key={date} style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 12, color: "#f97316", fontFamily: "'Space Mono', monospace", fontWeight: 700, marginBottom: 8 }}>{formatDate(date)}</div>
                      {entries.map((entry, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "12px 14px", marginBottom: 6 }}>
                          <div style={{ fontSize: 22 }}>{entry.challengeEmoji}</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>{entry.challengeName}</div>
                            <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{formatTs(entry.ts)}</div>
                          </div>
                          <div style={{ fontFamily: "'Space Mono', monospace", textAlign: "right" }}>
                            <div style={{ fontWeight: 700, color: "#f97316" }}>+{entry.amount.toLocaleString()}</div>
                            <div style={{ fontSize: 11, color: "#666" }}>{entry.unit}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "rgba(13,13,15,0.95)", backdropFilter: "blur(20px)", borderTop: "1px solid rgba(255,255,255,0.07)", padding: "10px 16px 20px", display: "flex", justifyContent: "space-between", zIndex: 100 }}>
        {navItems.map(item => (
          <button key={item.s} onClick={() => { setScreen(item.s); setSelectedChallenge(null); if (item.s === "chat") { markChatRead(); dismissMentionAlert(); } }}
            style={{ background: "none", border: "none", color: screen === item.s ? "#f97316" : "#555", cursor: "pointer", padding: "4px 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, fontSize: 9, fontWeight: 700, fontFamily: "'Space Mono', monospace", letterSpacing: 0.5, transition: "color 0.2s", position: "relative" }}>
            <span style={{ fontSize: 18, position: "relative" }}>
              {item.icon}
              {item.s === "chat" && unreadCount > 0 && (
                <span style={{ position: "absolute", top: -4, right: -6, background: "#ef4444", borderRadius: "50%", width: 14, height: 14, fontSize: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 900 }}>{unreadCount}</span>
              )}
            </span>
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
