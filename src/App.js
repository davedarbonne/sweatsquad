import { useState, useEffect, useRef } from "react";
import { db, auth, googleProvider } from "./firebase";
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { doc, getDoc, setDoc, onSnapshot, collection, addDoc, query, where, getDocs, deleteDoc } from "firebase/firestore";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged, sendPasswordResetEmail, updateProfile } from "firebase/auth";

const VAPID_KEY = "BObS3r8ohcb3-voKgEidcDFOnHaD8IayMPQrbaq9hEGFgus_0R7_9BfRomHU5ODLsBMJw6_F0Nc1v5CYQIz6sgA";

const BADGE_DEFS = [
  // Original
  { id: "first_blood", emoji: "🔥", label: "First Rep", desc: "Log your first entry" },
  { id: "streak3", emoji: "⚡", label: "On Fire", desc: "Log 3 days in a row" },
  { id: "finisher", emoji: "🏆", label: "Finisher", desc: "Complete a challenge" },
  { id: "podium", emoji: "🥇", label: "Top Dog", desc: "Reach #1 on the leaderboard" },
  { id: "centurion", emoji: "💯", label: "Centurion", desc: "Log 100 total reps/units" },
  // Activity
  { id: "early_bird", emoji: "🌅", label: "Early Bird", desc: "Log a workout before 7 AM" },
  { id: "week_warrior", emoji: "🔥", label: "Week Warrior", desc: "Log every day for 7 days straight" },
  { id: "centurion_x", emoji: "💥", label: "Centurion X", desc: "Log 1,000 total reps/units" },
  { id: "sharpshooter", emoji: "🎯", label: "Sharpshooter", desc: "Complete a challenge within 24h of deadline" },
  // Social
  { id: "welcome", emoji: "👋", label: "Welcome to the Squad", desc: "Log anything for the first time" },
  { id: "trash_talker", emoji: "🗣️", label: "Trash Talker", desc: "Send 10 chat messages" },
  { id: "team_player", emoji: "🤝", label: "Team Player", desc: "Accept 5 challenges" },
  { id: "hype_man", emoji: "📣", label: "Hype Man", desc: "React to 10 leaderboard entries" },
  // Challenge
  { id: "speed_demon", emoji: "⚡", label: "Speed Demon", desc: "Finish a challenge in the first half of its duration" },
  { id: "hat_trick", emoji: "🏅", label: "Hat Trick", desc: "Complete 3 challenges" },
  { id: "legend", emoji: "👑", label: "Legend", desc: "Complete 10 challenges" },
  { id: "podium_regular", emoji: "🎖️", label: "Podium Regular", desc: "Finish top 3 on 3 different challenges" },
  // Fun
  { id: "better_late", emoji: "🐢", label: "Better Late Than Never", desc: "Complete a challenge on the last day" },
  { id: "overachiever", emoji: "🤯", label: "Overachiever", desc: "Log double the goal on any challenge" },
  { id: "on_a_roll", emoji: "🌊", label: "On a Roll", desc: "Log 5 days in a row across any challenges" },
];

const CHALLENGE_TEMPLATES = [
  { name: "30-Day Pushup Challenge", unit: "pushups", goal: 1000, emoji: "💪", durationDays: 30 },
  { name: "10K Steps Daily", unit: "steps", goal: 300000, emoji: "👟", durationDays: 30 },
  { name: "Run 50 Miles", unit: "miles", goal: 50, emoji: "🏃", durationDays: 30 },
  { name: "100 Min Plank Month", unit: "seconds", goal: 6000, emoji: "🧘", durationDays: 30 },
  { name: "Burpee Blitz", unit: "burpees", goal: 500, emoji: "🔥", durationDays: 14 },
];

const AVATAR_COLORS = ["#e74c3c","#e67e22","#f1c40f","#2ecc71","#1abc9c","#3498db","#9b59b6","#e91e63","#ff6b6b","#4ecdc4","#45b7d1","#96ceb4"];
const AVATAR_TEXT_COLORS = ["#ffffff","#000000","#f97316","#fbbf24","#4ade80","#60a5fa"];

// Global avatar cache so all Avatar instances stay in sync
let _avatarProfiles = {};
let _avatarListeners = [];
const setAvatarProfiles = (profiles) => {
  _avatarProfiles = profiles;
  _avatarListeners.forEach(fn => fn(profiles));
};
const subscribeAvatars = (fn) => {
  _avatarListeners.push(fn);
  return () => { _avatarListeners = _avatarListeners.filter(f => f !== fn); };
};

function Avatar({ name, size = 36, onClick, avatarProfiles }) {
  const profile = (avatarProfiles || _avatarProfiles)[name];
  const defaultColors = ["#e74c3c","#e67e22","#f1c40f","#2ecc71","#1abc9c","#3498db","#9b59b6","#e91e63"];
  const idx = name ? name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % defaultColors.length : 0;
  const bgColor = profile?.bgColor || defaultColors[idx];
  const textColor = profile?.textColor || "#fff";
  const display = profile?.type === "emoji" ? profile.value
    : profile?.type === "face" ? profile.value
    : profile?.type === "two" ? (profile.value || name?.slice(0,2).toUpperCase())
    : profile?.value || name?.[0]?.toUpperCase() || "?";
  const isEmoji = profile?.type === "emoji" || profile?.type === "face";
  return (
    <div onClick={onClick} style={{
      width: size, height: size, borderRadius: "50%", background: bgColor,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: 800, fontSize: isEmoji ? size * 0.55 : (display?.length > 1 ? size * 0.32 : size * 0.4),
      color: textColor, flexShrink: 0,
      fontFamily: isEmoji ? "inherit" : "'Bebas Neue', cursive", letterSpacing: isEmoji ? 0 : 1,
      cursor: onClick ? "pointer" : "default",
    }}>
      {display}
    </div>
  );
}

function BadgeChip({ badge, earned = true, onTap }) {
  return (
    <div onClick={onTap} style={{
      background: earned ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.02)",
      border: `1px solid ${earned ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.06)"}`,
      borderRadius: 20, padding: "3px 10px", fontSize: 13, display: "flex",
      alignItems: "center", gap: 4, cursor: "pointer",
      opacity: earned ? 1 : 0.45, filter: earned ? "none" : "grayscale(1)"
    }}>
      <span>{badge.emoji}</span>
      <span style={{ color: earned ? "#ccc" : "#555", fontFamily: "'Space Mono', monospace", fontSize: 11 }}>{badge.label}</span>
      {!earned && <span style={{ fontSize: 9, color: "#444", fontFamily: "'Space Mono', monospace" }}>🔒</span>}
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
  const [authScreen, setAuthScreen] = useState("login"); // login | signup | forgot
  const [groupScreen, setGroupScreen] = useState("setup"); // setup | browse | create | join | settings
  const [currentGroup, setCurrentGroup] = useState(null); // { id, name, type, code, admins, members }
  const [userGroups, setUserGroups] = useState([]);
  const [allOpenGroups, setAllOpenGroups] = useState([]);
  const [groupSwitcherOpen, setGroupSwitcherOpen] = useState(false);
  const [groupCreateModal, setGroupCreateModal] = useState(null); // "create" | "join" | "browse" | null
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupType, setNewGroupType] = useState("closed");
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [pendingRequests, setPendingRequests] = useState([]);
  const [groupSettingsOpen, setGroupSettingsOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authDisplayName, setAuthDisplayName] = useState("");
  const [userName, setUserName] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [challenges, setChallenges] = useState([]);
  const [selectedChallenge, setSelectedChallenge] = useState(null);
  const [logAmount, setLogAmount] = useState("");
  const [newChallenge, setNewChallenge] = useState({ name: "", unit: "", goal: "", emoji: "💪", durationDays: "", videoUrl: "", description: "", goalType: "total", dailyGoal: "" });
  const [reactionPicker, setReactionPicker] = useState(null); // message id
  const [lbReactionPicker, setLbReactionPicker] = useState(null); // leaderboard user
  const [badgesExpanded, setBadgesExpanded] = useState(false);
  const [badgeModal, setBadgeModal] = useState(null); // { badge, earned }
  const [mentionAlert, setMentionAlert] = useState(null);
  const [notifPermission, setNotifPermission] = useState(typeof Notification !== "undefined" ? Notification.permission : "default");
  const [notifBannerDismissed, setNotifBannerDismissed] = useState(() => localStorage.getItem("sweatsquad_notif_dismissed") === "true");
  const [reminderTime, setReminderTime] = useState(() => localStorage.getItem("sweatsquad_reminder_time") || "07:00");
  const [lastSeenMentionTs, setLastSeenMentionTs] = useState(() => parseInt(localStorage.getItem("sweatsquad_lastmention") || "0"));
  const messagesEndRef = useRef(null);
  const [mentionList, setMentionList] = useState([]); // users shown in @ dropdown
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newBadges, setNewBadges] = useState([]);
  const [streakInfo, setStreakInfo] = useState(null); // { days, isNew, milestone }
  const [avatarProfiles, setAvatarProfilesState] = useState({});
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [avatarTab, setAvatarTab] = useState("emoji");
  const [avatarDraft, setAvatarDraft] = useState({ type: "letter", value: "", bgColor: "#f97316", textColor: "#ffffff" });
  const [streakBanner, setStreakBanner] = useState(null);
  const [monthlyRecap, setMonthlyRecap] = useState(null); // recap data object
  const [showRecap, setShowRecap] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [showArchive, setShowArchive] = useState(false);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [shareLog, setShareLog] = useState(null); // { challengeName, emoji, amount, unit }
  const [unreadCount, setUnreadCount] = useState(0);
  const [lastReadTs, setLastReadTs] = useState(() => parseInt(localStorage.getItem("sweatsquad_lastread") || "0"));

  // Firebase Auth state listener + handle Google redirect result
  useEffect(() => {
    getRedirectResult(auth).then((result) => {
      if (result?.user) {
        const name = result.user.displayName || result.user.email.split("@")[0];
        setUserName(name);
        localStorage.setItem("sweatsquad_username", name);
      }
    }).catch(() => {});

    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (user) {
        const name = user.displayName || user.email.split("@")[0];
        setUserName(name);
        localStorage.setItem("sweatsquad_username", name);
      } else {
        setUserName("");
      }
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  // Load avatar profiles from Firestore (global across groups)
  useEffect(() => {
    const ref = doc(db, "sweatsquad", "avatars");
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        const profiles = snap.data().profiles || {};
        setAvatarProfilesState(profiles);
        setAvatarProfiles(profiles);
        // Pre-populate draft with current user's profile
        if (userName && profiles[userName]) {
          setAvatarDraft(profiles[userName]);
        }
      }
    });
    return () => unsub();
  }, [userName]); // eslint-disable-line

  // Load user's groups
  useEffect(() => {
    if (!userName) return;
    const ref = collection(db, "groups");
    const unsub = onSnapshot(ref, (snap) => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const mine = all.filter(g => (g.members || []).includes(userName));
      const open = all.filter(g => g.type === "open" && !(g.members || []).includes(userName));
      setUserGroups(mine);
      setAllOpenGroups(open);
      // Auto-select last used group
      const lastGroupId = localStorage.getItem(`sweatsquad_group_${userName}`);
      const lastGroup = mine.find(g => g.id === lastGroupId) || mine[0];
      if (lastGroup && (!currentGroup || !mine.find(g => g.id === currentGroup.id))) {
        setCurrentGroup(lastGroup);
      }
      if (mine.length === 0) setGroupScreen("setup");
    });
    return () => unsub();
  }, [userName]); // eslint-disable-line

  // Real-time listener for challenges from Firestore (group-scoped)
  useEffect(() => {
    if (!currentGroup) { setLoading(false); return; }
    const ref = doc(db, "groups", currentGroup.id, "data", "challenges");
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        setChallenges(snap.data().list || []);
      } else {
        setChallenges([]);
      }
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [currentGroup?.id]); // eslint-disable-line

  // Real-time chat listener (group-scoped)
  useEffect(() => {
    if (!currentGroup) return;
    const ref = doc(db, "groups", currentGroup.id, "data", "chat");
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        const msgs = snap.data().messages || [];
        setMessages(msgs);
        const unread = msgs.filter(m => m.ts > lastReadTs && m.user !== userName).length;
        setUnreadCount(unread);
      } else {
        setMessages([]);
      }
    });
    return () => unsub();
  }, [currentGroup?.id, lastReadTs, userName]); // eslint-disable-line

  // Monthly recap — show for first 3 days of month
  useEffect(() => {
    if (!currentGroup || !challenges.length || !userName) return;
    const now = new Date();
    const dayOfMonth = now.getDate();
    if (dayOfMonth > 3) return; // only show first 3 days

    const lastMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
    const lastMonthYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const recapKey = `sweatsquad_recap_${currentGroup.id}_${lastMonthYear}_${lastMonth}`;
    if (localStorage.getItem(recapKey)) return; // already seen

    // Calculate last month's stats
    const isLastMonth = (ts) => {
      const d = new Date(ts);
      return d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear;
    };

    const monthName = new Date(lastMonthYear, lastMonth, 1).toLocaleString("en-US", { month: "long" });
    const members = new Set();
    challenges.forEach(ch => (ch.logs || []).forEach(l => members.add(l.user)));

    // Per-user stats for last month
    const userStats = {};
    [...members].forEach(user => {
      let reps = 0, completedChallenges = 0, points = 0, badges = 0, streak = 0;
      const logDates = new Set();

      challenges.forEach(ch => {
        const monthLogs = (ch.logs || []).filter(l => l.user === user && isLastMonth(l.ts));
        const monthTotal = monthLogs.reduce((a, l) => a + l.amount, 0);
        reps += monthTotal;
        monthLogs.forEach(l => logDates.add(new Date(l.ts).toISOString().slice(0, 10)));

        // completed in last month
        if (monthTotal > 0) {
          const allLogs = (ch.logs || []).filter(l => l.user === user);
          const allTotal = allLogs.reduce((a, l) => a + l.amount, 0);
          if (allTotal >= ch.goal) {
            const sorted = allLogs.sort((a, b) => a.ts - b.ts);
            let running = 0;
            for (const log of sorted) {
              running += log.amount;
              if (running >= ch.goal && isLastMonth(log.ts)) { completedChallenges++; break; }
            }
          }
        }
      });

      // Monthly streak
      const sortedDays = [...logDates].sort();
      let curStreak = 1, maxStreak = sortedDays.length > 0 ? 1 : 0;
      for (let i = 1; i < sortedDays.length; i++) {
        const diff = (new Date(sortedDays[i]) - new Date(sortedDays[i-1])) / 86400000;
        if (diff === 1) { curStreak++; maxStreak = Math.max(maxStreak, curStreak); }
        else curStreak = 1;
      }

      // Monthly points: completion + badges
      let monthPoints = 0;
      challenges.forEach(ch => {
        const completers = [];
        const userTotals = {};
        (ch.logs || []).filter(l => isLastMonth(l.ts)).forEach(l => {
          userTotals[l.user] = (userTotals[l.user] || 0) + l.amount;
        });
        Object.entries(userTotals).forEach(([u, total]) => {
          if (total >= ch.goal) {
            const logs = (ch.logs || []).filter(l => l.user === u && isLastMonth(l.ts));
            let running = 0, completedTs = null;
            for (const log of logs.sort((a,b) => a.ts - b.ts)) {
              running += log.amount;
              if (running >= ch.goal) { completedTs = log.ts; break; }
            }
            if (completedTs) completers.push({ user: u, completedTs });
          }
        });
        completers.sort((a, b) => a.completedTs - b.completedTs);
        const rank = completers.findIndex(c => c.user === user);
        if (rank === 0) monthPoints += 5;
        else if (rank === 1) monthPoints += 4;
        else if (rank === 2) monthPoints += 3;
        else if (rank > 2) monthPoints += 2;
      });

      // Badges earned this month (approximate — count all current badges)
      const allBadges = getUserBadges(user, challenges, messages, 0);
      badges = allBadges.length;

      userStats[user] = { reps, completedChallenges, points: monthPoints, badges, streak: maxStreak };
    });

    // Group totals
    const totalReps = Object.values(userStats).reduce((a, s) => a + s.reps, 0);
    const totalCompleted = Object.values(userStats).reduce((a, s) => a + s.completedChallenges, 0);
    const ranked = Object.entries(userStats).sort((a, b) => b[1].points - a[1].points);

    if (ranked.length === 0 || totalReps === 0) return; // nothing to show

    const mvp = ranked[0][0];
    const mostReps = Object.entries(userStats).sort((a, b) => b[1].reps - a[1].reps)[0];
    const mostCompleted = Object.entries(userStats).sort((a, b) => b[1].completedChallenges - a[1].completedChallenges)[0];
    const longestStreak = Object.entries(userStats).sort((a, b) => b[1].streak - a[1].streak)[0];

    setMonthlyRecap({
      monthName, lastMonthYear, ranked, userStats, totalReps, totalCompleted,
      mvp, mostReps: mostReps[0], mostRepsCount: mostReps[1].reps,
      mostCompleted: mostCompleted[0], mostCompletedCount: mostCompleted[1].completedChallenges,
      longestStreak: longestStreak[0], longestStreakDays: longestStreak[1].streak,
      recapKey,
    });
    setShowRecap(true);
  }, [currentGroup?.id, challenges.length, userName]); // eslint-disable-line

  // Watch pending join requests for admins
  useEffect(() => {
    if (!currentGroup) return;
    const isAdmin = (currentGroup.admins || []).includes(userName);
    if (!isAdmin || currentGroup.type !== "closed") return;
    const pending = currentGroup.pendingMembers || [];
    setPendingRequests(pending);
  }, [currentGroup, userName]);

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
        const tokensRef = collection(db, "fcmTokens");
        const existing = await getDocs(query(tokensRef, where("token", "==", token)));
        existing.forEach(d => deleteDoc(d.ref));
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const savedTime = localStorage.getItem("sweatsquad_reminder_time") || "07:00";
        await addDoc(tokensRef, { username: userName, token, updatedAt: Date.now(), timezone, reminderTime: savedTime });
      }
      // Handle foreground messages — show toast only, suppresses system notification
      onMessage(messaging, (payload) => {
        // Returning without calling showNotification() suppresses the service worker popup
        // so we only show the in-app toast, preventing doubles
        const { title, body } = payload.notification;
        showToast(`🔔 ${body}`, "success");
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
    if (!currentGroup) return;
    const ref = doc(db, "groups", currentGroup.id, "data", "challenges");
    await setDoc(ref, { list: updated });
  };

  const saveGroup = async (groupData) => {
    const ref = doc(db, "groups", groupData.id);
    await setDoc(ref, groupData);
  };

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSignUp = async () => {
    setAuthError("");
    if (!authDisplayName.trim()) { setAuthError("Please enter a display name"); return; }
    if (!authEmail.trim()) { setAuthError("Please enter your email"); return; }
    if (authPassword.length < 6) { setAuthError("Password must be at least 6 characters"); return; }
    try {
      const cred = await createUserWithEmailAndPassword(auth, authEmail, authPassword);
      await updateProfile(cred.user, { displayName: authDisplayName.trim() });
      setUserName(authDisplayName.trim());
      localStorage.setItem("sweatsquad_username", authDisplayName.trim());
    } catch (err) {
      if (err.code === "auth/email-already-in-use") setAuthError("Email already in use — try logging in");
      else if (err.code === "auth/invalid-email") setAuthError("Invalid email address");
      else setAuthError("Sign up failed — please try again");
    }
  };

  const handleLogin = async () => {
    setAuthError("");
    if (!authEmail.trim() || !authPassword) { setAuthError("Please enter email and password"); return; }
    try {
      await signInWithEmailAndPassword(auth, authEmail, authPassword);
    } catch (err) {
      if (err.code === "auth/invalid-credential" || err.code === "auth/wrong-password") setAuthError("Incorrect email or password");
      else if (err.code === "auth/user-not-found") setAuthError("No account found — try signing up");
      else setAuthError("Login failed — please try again");
    }
  };

  const handleGoogleSignIn = async () => {
    setAuthError("");
    try {
      await signInWithRedirect(auth, googleProvider);
    } catch (err) {
      setAuthError("Google sign in failed — please try again");
    }
  };

  const handleForgotPassword = async () => {
    setAuthError("");
    if (!authEmail.trim()) { setAuthError("Enter your email above first"); return; }
    try {
      await sendPasswordResetEmail(auth, authEmail);
      setAuthError("✅ Reset email sent! Check your inbox");
    } catch (err) {
      setAuthError("Could not send reset email — check your address");
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setUserName("");
    localStorage.removeItem("sweatsquad_username");
    setScreen("home");
  };

  const handleSaveAvatar = async () => {
    const ref = doc(db, "sweatsquad", "avatars");
    const snap = await getDoc(ref);
    const profiles = snap.exists() ? (snap.data().profiles || {}) : {};
    profiles[userName] = avatarDraft;
    await setDoc(ref, { profiles });
    setAvatarPickerOpen(false);
    showToast("Avatar updated! 🎨");
  };

  const handleUpdateReminderTime = async (time) => {
    setReminderTime(time);
    localStorage.setItem("sweatsquad_reminder_time", time);
    // Update all tokens for this user in Firestore
    try {
      const tokensRef = collection(db, "fcmTokens");
      const existing = await getDocs(query(tokensRef, where("username", "==", userName)));
      for (const d of existing.docs) {
        await setDoc(d.ref, { ...d.data(), reminderTime: time });
      }
      showToast("Reminder time updated! ⏰");
    } catch (err) {
      console.log("Could not update reminder time:", err);
    }
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

  const getUserBadges = (user, allChallenges, allMessages = [], lbReactionCount = 0) => {
    const earned = new Set();
    let totalLogged = 0;
    let finishedCount = 0;
    let podiumCount = 0;
    let acceptedCount = (allChallenges.filter(ch => (ch.accepted || []).includes(user))).length;

    // Collect all log dates across all challenges for streak calc
    const allLogDates = new Set();

    allChallenges.forEach(ch => {
      const entries = (ch.logs || []).filter(l => l.user === user);
      const total = entries.reduce((a, l) => a + l.amount, 0);
      totalLogged += total;
      entries.forEach(l => allLogDates.add(l.date));

      // Early bird: any log before 7 AM
      entries.forEach(l => {
        const hour = new Date(l.ts).getHours();
        if (hour < 7) earned.add("early_bird");
      });

      if (total >= ch.goal) {
        finishedCount++;
        earned.add("finisher");

        // Overachiever: logged double the goal
        if (total >= ch.goal * 2) earned.add("overachiever");

        // Better late than never: completed on last day of duration
        if (ch.durationDays) {
          const endTs = ch.createdAt + ch.durationDays * 86400000;
          const logs = entries.sort((a,b) => a.ts - b.ts);
          let running = 0;
          for (const log of logs) {
            running += log.amount;
            if (running >= ch.goal) {
              const daysLeft = (endTs - log.ts) / 86400000;
              if (daysLeft <= 1) earned.add("better_late");
              // Speed demon: finished in first half of duration
              const elapsed = log.ts - ch.createdAt;
              const halfDuration = (ch.durationDays * 86400000) / 2;
              if (elapsed <= halfDuration) earned.add("speed_demon");
              // Sharpshooter: finished within 24h of deadline
              if (daysLeft <= 1 && daysLeft >= 0) earned.add("sharpshooter");
              break;
            }
          }
        }
      }

      // Leaderboard checks
      const leaderboard = buildLeaderboard(ch);
      if (leaderboard[0]?.user === user && leaderboard[0]?.total > 0) earned.add("podium");
      const rank = leaderboard.findIndex(e => e.user === user);
      if (rank >= 0 && rank <= 2 && leaderboard[rank].total > 0) podiumCount++;
    });

    // Streak checks across all challenges
    const sortedDays = [...allLogDates].sort();
    let streak = 1;
    let maxStreak = sortedDays.length > 0 ? 1 : 0;
    for (let i = 1; i < sortedDays.length; i++) {
      const diff = (new Date(sortedDays[i]) - new Date(sortedDays[i-1])) / 86400000;
      if (diff === 1) { streak++; maxStreak = Math.max(maxStreak, streak); }
      else streak = 1;
    }
    if (maxStreak >= 3) earned.add("streak3");
    if (maxStreak >= 5) earned.add("on_a_roll");
    if (maxStreak >= 7) earned.add("week_warrior");

    // Totals
    if (totalLogged > 0) { earned.add("first_blood"); earned.add("welcome"); }
    if (totalLogged >= 100) earned.add("centurion");
    if (totalLogged >= 1000) earned.add("centurion_x");

    // Challenge counts
    if (finishedCount >= 3) earned.add("hat_trick");
    if (finishedCount >= 10) earned.add("legend");
    if (podiumCount >= 3) earned.add("podium_regular");
    if (acceptedCount >= 5) earned.add("team_player");

    // Social: chat messages
    const userMessages = allMessages.filter(m => m.user === user && !m.deleted);
    if (userMessages.length >= 10) earned.add("trash_talker");

    // Hype man: lb reactions
    if (lbReactionCount >= 10) earned.add("hype_man");

    return BADGE_DEFS.filter(b => earned.has(b.id));
  };

  const getPoints = (user, allChallenges) => {
    let points = 0;
    // Streak bonus points
    const tzOffset = 0; // use UTC for consistency in points calc
    const allDates = new Set();
    allChallenges.forEach(ch => {
      (ch.logs || []).filter(l => l.user === user).forEach(l => {
        allDates.add(new Date(l.ts).toISOString().slice(0, 10));
      });
    });
    const sorted = [...allDates].sort();
    let streak = 1;
    for (let i = 1; i < sorted.length; i++) {
      const diff = (new Date(sorted[i]) - new Date(sorted[i-1])) / 86400000;
      if (diff === 1) {
        streak++;
        if (streak === 3) points += 1;
        else if (streak > 3 && streak % 7 === 0) points += 2;
      } else {
        streak = 1;
      }
    }
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

  const handleAccept = async (challengeId) => {
    if (!userName) { showToast("Set your name first!", "error"); return; }
    const updated = challenges.map(ch => {
      if (ch.id !== challengeId) return ch;
      const accepted = ch.accepted || [];
      if (accepted.includes(userName)) return ch;
      return { ...ch, accepted: [...accepted, userName] };
    });
    await save(updated);
    showToast("Challenge accepted! 💪");
  };

  const handleLog = async () => {
    if (!userName) { showToast("Set your name first!", "error"); return; }
    if (isExpired(selectedChallenge)) { showToast("This challenge has ended!", "error"); return; }
    const amt = parseFloat(logAmount);
    if (!amt || amt <= 0) { showToast("Enter a valid amount", "error"); return; }

    const today = new Date().toISOString().slice(0, 10);
    const entry = { user: userName, amount: amt, date: today, ts: Date.now() };
    // Auto-accept on first log
    const alreadyAccepted = (selectedChallenge.accepted || []).includes(userName);

    const prevBadges = getUserBadges(userName, challenges);
    const updated = challenges.map(ch =>
      ch.id === selectedChallenge.id ? {
        ...ch,
        logs: [...(ch.logs || []), entry],
        accepted: alreadyAccepted ? (ch.accepted || []) : [...(ch.accepted || []), userName]
      } : ch
    );
    await save(updated);

    const newB = getUserBadges(userName, updated);
    const gained = newB.filter(b => !prevBadges.find(p => p.id === b.id));
    if (gained.length) { setNewBadges(gained); setTimeout(() => setNewBadges([]), 4000); }

    setLogAmount("");
    showToast(`+${amt} ${selectedChallenge.unit} logged! 💪`);
    setShareLog({ challengeName: selectedChallenge.name, emoji: selectedChallenge.emoji, amount: amt, unit: selectedChallenge.unit });

    // Calculate streak after log
    const tzOffset = new Date().getTimezoneOffset() * -60000;
    const prevStreak = getCurrentStreak(userName, challenges, tzOffset);
    const newStreak = getCurrentStreak(userName, updated, tzOffset);
    if (newStreak > 0) {
      const milestone = getStreakPoints(newStreak);
      const isExtended = newStreak > prevStreak;
      if (isExtended || newStreak === 1) {
        setStreakBanner({ days: newStreak, milestone });
        setTimeout(() => setStreakBanner(null), 4000);
      }
    }
  };

  const handleCreateChallenge = async () => {
    if (!newChallenge.name || !newChallenge.unit) { showToast("Fill all fields", "error"); return; }
    if (newChallenge.goalType === "daily" && (!newChallenge.dailyGoal || !newChallenge.durationDays)) {
      showToast("Daily challenges need a daily goal and duration", "error"); return;
    }
    if (newChallenge.goalType === "total" && !newChallenge.goal) { showToast("Fill all fields", "error"); return; }
    const ch = {
      id: Date.now().toString(),
      name: newChallenge.name,
      unit: newChallenge.unit,
      goal: newChallenge.goalType === "daily" ? parseFloat(newChallenge.dailyGoal) * parseInt(newChallenge.durationDays || 1) : parseFloat(newChallenge.goal),
      emoji: newChallenge.emoji,
      durationDays: newChallenge.durationDays ? parseInt(newChallenge.durationDays) : null,
      goalType: newChallenge.goalType || "total",
      dailyGoal: newChallenge.goalType === "daily" && newChallenge.dailyGoal ? parseFloat(newChallenge.dailyGoal) : null,
      videoUrl: newChallenge.videoUrl || null,
      description: newChallenge.description || null,
      createdBy: userName || "Anonymous",
      createdAt: Date.now(),
      logs: [],
    };
    setNewChallenge({ name: "", unit: "", goal: "", emoji: "💪", durationDays: "", videoUrl: "", description: "", goalType: "total", dailyGoal: "" });
    setSelectedChallenge(null);
    setScreen("home");
    setShowArchive(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
    showToast("Challenge created! 🎉");
    await save([...challenges, ch]);
  };

  const handleSendMessage = async (logShare = null) => {
    if (!userName || !currentGroup) { showToast("Set your name first!", "error"); return; }
    const text = logShare ? null : chatInput.trim();
    if (!logShare && !text) return;
    const msg = {
      id: Date.now().toString(),
      user: userName,
      ts: Date.now(),
      text: logShare ? null : text,
      logShare: logShare || null,
    };
    const ref = doc(db, "groups", currentGroup.id, "data", "chat");
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

  // Generate a random 6-character group code
  const generateGroupCode = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) { showToast("Enter a group name", "error"); return; }
    const code = generateGroupCode();
    const group = {
      id: Date.now().toString(),
      name: newGroupName.trim(),
      type: newGroupType,
      code,
      createdBy: userName,
      createdAt: Date.now(),
      admins: [userName],
      members: [userName],
      pendingMembers: [],
    };
    await setDoc(doc(db, "groups", group.id), group);
    setCurrentGroup(group);
    localStorage.setItem(`sweatsquad_group_${userName}`, group.id);
    setNewGroupName("");
    setGroupCreateModal(null);
    setGroupSwitcherOpen(false);
    showToast("Group created! 🎉");
  };

  const handleJoinOpenGroup = async (group) => {
    const updated = { ...group, members: [...(group.members || []), userName] };
    await saveGroup(updated);
    setCurrentGroup(updated);
    localStorage.setItem(`sweatsquad_group_${userName}`, group.id);
    setGroupSwitcherOpen(false);
    showToast(`Joined ${group.name}! 💪`);
  };

  const handleRequestJoin = async () => {
    if (!joinCodeInput.trim()) { showToast("Enter a group code", "error"); return; }
    const code = joinCodeInput.trim().toUpperCase();
    const snap = await getDocs(collection(db, "groups"));
    const group = snap.docs.map(d => ({ id: d.id, ...d.data() })).find(g => g.code === code);
    if (!group) { showToast("Group not found — check the code", "error"); return; }
    if ((group.members || []).includes(userName)) { showToast("You're already in this group!", "error"); return; }
    if (group.type === "open") {
      await handleJoinOpenGroup(group);
    } else {
      // Add to pending
      if ((group.pendingMembers || []).includes(userName)) { showToast("Request already sent!", "error"); return; }
      const updated = { ...group, pendingMembers: [...(group.pendingMembers || []), userName] };
      await saveGroup(updated);
      // Save a join request notification for the Cloud Function to pick up
      try {
        await addDoc(collection(db, "joinRequests"), {
          groupId: group.id,
          groupName: group.name,
          requester: userName,
          admins: group.admins || [],
          ts: Date.now(),
          notified: false,
        });
      } catch (_) {}
      showToast("Request sent! Wait for admin approval 🙏");
    }
    setJoinCodeInput("");
    setGroupCreateModal(null);
    setGroupSwitcherOpen(false);
  };

  const handleApproveMember = async (memberName) => {
    const updated = {
      ...currentGroup,
      members: [...(currentGroup.members || []), memberName],
      pendingMembers: (currentGroup.pendingMembers || []).filter(m => m !== memberName),
    };
    await saveGroup(updated);
    setCurrentGroup(updated);
    showToast(`${memberName} approved! 🎉`);
  };

  const handleRejectMember = async (memberName) => {
    const updated = {
      ...currentGroup,
      pendingMembers: (currentGroup.pendingMembers || []).filter(m => m !== memberName),
    };
    await saveGroup(updated);
    setCurrentGroup(updated);
    showToast(`${memberName} removed from requests`);
  };

  const handleRemoveMember = async (memberName) => {
    const updated = {
      ...currentGroup,
      members: (currentGroup.members || []).filter(m => m !== memberName),
      admins: (currentGroup.admins || []).filter(m => m !== memberName),
    };
    // If no admins left, make oldest remaining member admin
    if (updated.admins.length === 0 && updated.members.length > 0) {
      updated.admins = [updated.members[0]];
    }
    await saveGroup(updated);
    setCurrentGroup(updated);
    showToast(`${memberName} removed from group`);
  };

  const handleToggleAdmin = async (memberName) => {
    const isAdmin = (currentGroup.admins || []).includes(memberName);
    const updated = {
      ...currentGroup,
      admins: isAdmin
        ? (currentGroup.admins || []).filter(m => m !== memberName)
        : [...(currentGroup.admins || []), memberName],
    };
    await saveGroup(updated);
    setCurrentGroup(updated);
    showToast(isAdmin ? `${memberName} is no longer an admin` : `${memberName} is now an admin!`);
  };

  const handleLeaveGroup = async () => {
    const updated = {
      ...currentGroup,
      members: (currentGroup.members || []).filter(m => m !== userName),
      admins: (currentGroup.admins || []).filter(m => m !== userName),
    };
    if (updated.admins.length === 0 && updated.members.length > 0) {
      updated.admins = [updated.members[0]];
    }
    await saveGroup(updated);
    localStorage.removeItem(`sweatsquad_group_${userName}`);
    setCurrentGroup(null);
    setGroupSettingsOpen(false);
    showToast("You left the group");
  };

  const switchGroup = (group) => {
    setCurrentGroup(group);
    localStorage.setItem(`sweatsquad_group_${userName}`, group.id);
    setGroupSwitcherOpen(false);
    setChallenges([]);
    setMessages([]);
    setScreen("home");
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

  const isAccepted = (ch) => {
    if (!userName) return false;
    return (ch.accepted || []).includes(userName);
  };

  const isNew = (ch) => {
    return ch.createdAt && Date.now() - ch.createdAt < 86400000;
  };

  const isArchived = (ch) => {
    const end = getEndTs(ch);
    // If timed challenge, give 24h grace period after expiry before archiving
    if (end) {
      const gracePeriod = end + 86400000;
      if (Date.now() < gracePeriod) return false;
      return true;
    }
    // No duration: archive when everyone has completed it
    const lb = buildLeaderboard(ch);
    const allDone = lb.length > 0 && lb.every(e => e.total >= ch.goal);
    return allDone;
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

  const getCurrentStreak = (user, allChallenges, tzOffset = 0) => {
    const allDates = new Set();
    allChallenges.forEach(ch => {
      (ch.logs || []).filter(l => l.user === user).forEach(l => {
        // Convert timestamp to user's local date
        const localDate = new Date(l.ts + tzOffset);
        const dateStr = `${localDate.getUTCFullYear()}-${String(localDate.getUTCMonth()+1).padStart(2,'0')}-${String(localDate.getUTCDate()).padStart(2,'0')}`;
        allDates.add(dateStr);
      });
    });
    const sorted = [...allDates].sort().reverse();
    if (!sorted.length) return 0;
    // Check if today or yesterday has a log (streak still active)
    const now = new Date(Date.now() + tzOffset);
    const todayStr = `${now.getUTCFullYear()}-${String(now.getUTCMonth()+1).padStart(2,'0')}-${String(now.getUTCDate()).padStart(2,'0')}`;
    const yesterday = new Date(Date.now() + tzOffset - 86400000);
    const yesterdayStr = `${yesterday.getUTCFullYear()}-${String(yesterday.getUTCMonth()+1).padStart(2,'0')}-${String(yesterday.getUTCDate()).padStart(2,'0')}`;
    if (sorted[0] !== todayStr && sorted[0] !== yesterdayStr) return 0;
    let streak = 1;
    for (let i = 1; i < sorted.length; i++) {
      const curr = new Date(sorted[i-1]);
      const prev = new Date(sorted[i]);
      const diff = (curr - prev) / 86400000;
      if (diff === 1) streak++;
      else break;
    }
    return streak;
  };

  const getStreakPoints = (streak) => {
    if (streak === 3) return 1;
    if (streak > 3 && streak % 7 === 0) return 2;
    return 0;
  };

  const getDailyTotal = (ch, user, dateStr) => {
    return (ch.logs || []).filter(l => l.user === user && l.date === dateStr).reduce((a, l) => a + l.amount, 0);
  };

  const getDailyGrid = (ch, user) => {
    if (!ch.dailyGoal || !ch.durationDays) return [];
    return Array.from({ length: ch.durationDays }, (_, i) => {
      const d = new Date(ch.createdAt + i * 86400000);
      const dateStr = d.toISOString().slice(0, 10);
      const dayTotal = getDailyTotal(ch, user, dateStr);
      const hit = dayTotal >= ch.dailyGoal;
      const todayStr = new Date().toISOString().slice(0, 10);
      const isToday = dateStr === todayStr;
      const isPast = dateStr < todayStr;
      return { dateStr, dayTotal, hit, isToday, isPast, dayNum: i + 1 };
    });
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
    if (!currentGroup) return;
    const ref = doc(db, "groups", currentGroup.id, "data", "chat");
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
    if (!currentGroup) return;
    const ref = doc(db, "groups", currentGroup.id, "data", "chat");
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

  // Show auth screen if not logged in
  if (!authLoading && !currentUser) {
    return (
      <div style={{ minHeight: "100vh", background: "#0d0d0f", fontFamily: "'DM Sans', sans-serif", color: "#f0f0f0", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />
        <div style={{ position: "fixed", top: -100, left: "50%", transform: "translateX(-50%)", width: 600, height: 300, borderRadius: "50%", background: "radial-gradient(ellipse, rgba(249,115,22,0.15) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div style={{ width: "100%", maxWidth: 380, position: "relative", zIndex: 1 }}>
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 42, letterSpacing: 3, lineHeight: 1 }}>
              SWEAT<span style={{ color: "#f97316" }}>SQUAD</span>
            </div>
            <div style={{ fontSize: 12, color: "#666", fontFamily: "'Space Mono', monospace", marginTop: 4, letterSpacing: 2 }}>CHALLENGE YOUR CREW</div>
          </div>

          {authError && (
            <div style={{ background: authError.startsWith("✅") ? "rgba(74,222,128,0.1)" : "rgba(239,68,68,0.1)", border: `1px solid ${authError.startsWith("✅") ? "rgba(74,222,128,0.3)" : "rgba(239,68,68,0.3)"}`, borderRadius: 12, padding: "10px 16px", marginBottom: 16, fontSize: 13, color: authError.startsWith("✅") ? "#4ade80" : "#f87171", textAlign: "center" }}>
              {authError}
            </div>
          )}

          <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: 24 }}>
            {authScreen === "signup" && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: "#888", marginBottom: 6, fontWeight: 600 }}>Display Name</div>
                <input value={authDisplayName} onChange={e => setAuthDisplayName(e.target.value)}
                  placeholder="What name have you been using?"
                  style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "12px 14px", color: "#fff", fontSize: 15, outline: "none", boxSizing: "border-box" }} />
                <div style={{ fontSize: 11, color: "#666", marginTop: 6 }}>⚠️ Use the same name you've been logging with to keep your history</div>
              </div>
            )}

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 6, fontWeight: 600 }}>Email</div>
              <input type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)}
                onKeyDown={e => e.key === "Enter" && (authScreen === "login" ? handleLogin() : authScreen === "signup" ? handleSignUp() : handleForgotPassword())}
                placeholder="your@email.com"
                style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "12px 14px", color: "#fff", fontSize: 15, outline: "none", boxSizing: "border-box" }} />
            </div>

            {authScreen !== "forgot" && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: "#888", marginBottom: 6, fontWeight: 600 }}>Password</div>
                <input type="password" value={authPassword} onChange={e => setAuthPassword(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && (authScreen === "login" ? handleLogin() : handleSignUp())}
                  placeholder={authScreen === "signup" ? "At least 6 characters" : "Your password"}
                  style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "12px 14px", color: "#fff", fontSize: 15, outline: "none", boxSizing: "border-box" }} />
              </div>
            )}

            {authScreen === "login" && (
              <>
                <button onClick={handleLogin} style={{ width: "100%", background: "linear-gradient(135deg, #f97316, #ea580c)", border: "none", borderRadius: 12, padding: 14, color: "#fff", fontWeight: 800, cursor: "pointer", fontSize: 16, fontFamily: "'Bebas Neue', cursive", letterSpacing: 2, marginBottom: 12 }}>
                  LOG IN
                </button>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <button onClick={() => { setAuthScreen("signup"); setAuthError(""); }} style={{ background: "none", border: "none", color: "#f97316", cursor: "pointer", fontSize: 13 }}>Create account</button>
                  <button onClick={() => { setAuthScreen("forgot"); setAuthError(""); }} style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 13 }}>Forgot password?</button>
                </div>
              </>
            )}

            {authScreen === "signup" && (
              <>
                <button onClick={handleSignUp} style={{ width: "100%", background: "linear-gradient(135deg, #f97316, #ea580c)", border: "none", borderRadius: 12, padding: 14, color: "#fff", fontWeight: 800, cursor: "pointer", fontSize: 16, fontFamily: "'Bebas Neue', cursive", letterSpacing: 2, marginBottom: 12 }}>
                  JOIN THE SQUAD
                </button>
                <div style={{ textAlign: "center" }}>
                  <button onClick={() => { setAuthScreen("login"); setAuthError(""); }} style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 13 }}>Already have an account? Log in</button>
                </div>
              </>
            )}

            {authScreen === "forgot" && (
              <>
                <button onClick={handleForgotPassword} style={{ width: "100%", background: "rgba(249,115,22,0.15)", border: "1px solid rgba(249,115,22,0.3)", borderRadius: 12, padding: 14, color: "#f97316", fontWeight: 700, cursor: "pointer", fontSize: 15, marginBottom: 12 }}>
                  Send Reset Email
                </button>
                <div style={{ textAlign: "center" }}>
                  <button onClick={() => { setAuthScreen("login"); setAuthError(""); }} style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 13 }}>Back to login</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (authLoading || loading) return (
    <div style={{ minHeight: "100vh", background: "#0d0d0f", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ fontSize: 48 }}>🏋️</div>
    </div>
  );

  // Group setup screen — shown when user has no groups
  if (currentUser && !currentGroup && userGroups.length === 0) {
    return (
      <div style={{ minHeight: "100vh", background: "#0d0d0f", fontFamily: "'DM Sans', sans-serif", color: "#f0f0f0", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />
        <div style={{ width: "100%", maxWidth: 380, position: "relative", zIndex: 1 }}>
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 42, letterSpacing: 3 }}>SWEAT<span style={{ color: "#f97316" }}>SQUAD</span></div>
            <div style={{ fontSize: 12, color: "#666", fontFamily: "'Space Mono', monospace", marginTop: 4, letterSpacing: 2 }}>WELCOME, {userName.toUpperCase()}!</div>
          </div>

          {groupScreen === "setup" && (
            <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: 24 }}>
              <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8, textAlign: "center" }}>Join or Create a Squad</div>
              <div style={{ fontSize: 14, color: "#888", textAlign: "center", marginBottom: 24 }}>Get started by creating your own group or joining an existing one</div>
              <button onClick={() => setGroupScreen("create")} style={{ width: "100%", background: "linear-gradient(135deg, #f97316, #ea580c)", border: "none", borderRadius: 12, padding: 14, color: "#fff", fontWeight: 800, cursor: "pointer", fontSize: 16, fontFamily: "'Bebas Neue', cursive", letterSpacing: 2, marginBottom: 12 }}>
                CREATE A GROUP
              </button>
              <button onClick={() => setGroupScreen("join")} style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: 14, color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 15, marginBottom: 12 }}>
                Join with Code
              </button>
              <button onClick={() => setGroupScreen("browse")} style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 14, color: "#aaa", fontWeight: 700, cursor: "pointer", fontSize: 15 }}>
                Browse Open Groups
              </button>
            </div>
          )}

          {groupScreen === "create" && (
            <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: 24 }}>
              <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 20 }}>Create a Group</div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: "#888", marginBottom: 6, fontWeight: 600 }}>Group Name</div>
                <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="e.g. The Boys, Work Crew..." style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "12px 14px", color: "#fff", fontSize: 15, outline: "none", boxSizing: "border-box" }} />
              </div>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: "#888", marginBottom: 10, fontWeight: 600 }}>Group Type</div>
                <div style={{ display: "flex", gap: 10 }}>
                  {["open", "closed"].map(t => (
                    <button key={t} onClick={() => setNewGroupType(t)} style={{ flex: 1, background: newGroupType === t ? "rgba(249,115,22,0.15)" : "rgba(255,255,255,0.04)", border: `1px solid ${newGroupType === t ? "rgba(249,115,22,0.5)" : "rgba(255,255,255,0.1)"}`, borderRadius: 10, padding: "12px 8px", color: newGroupType === t ? "#f97316" : "#888", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
                      {t === "open" ? "🌐 Open" : "🔒 Closed"}
                      <div style={{ fontSize: 10, fontWeight: 400, marginTop: 4, color: "#666" }}>{t === "open" ? "Anyone can join" : "Invite only"}</div>
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={handleCreateGroup} style={{ width: "100%", background: "linear-gradient(135deg, #f97316, #ea580c)", border: "none", borderRadius: 12, padding: 14, color: "#fff", fontWeight: 800, cursor: "pointer", fontSize: 16, fontFamily: "'Bebas Neue', cursive", letterSpacing: 2, marginBottom: 12 }}>
                CREATE GROUP 🚀
              </button>
              <button onClick={() => setGroupScreen("setup")} style={{ width: "100%", background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 14 }}>← Back</button>
            </div>
          )}

          {groupScreen === "join" && (
            <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: 24 }}>
              <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 20 }}>Join with Code</div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: "#888", marginBottom: 6, fontWeight: 600 }}>Invite Code</div>
                <input value={joinCodeInput} onChange={e => setJoinCodeInput(e.target.value.toUpperCase())} placeholder="e.g. ABC123" maxLength={6}
                  style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "12px 14px", color: "#fff", fontSize: 20, outline: "none", boxSizing: "border-box", textAlign: "center", letterSpacing: 4, fontFamily: "'Space Mono', monospace", fontWeight: 700 }} />
              </div>
              <button onClick={handleRequestJoin} style={{ width: "100%", background: "linear-gradient(135deg, #f97316, #ea580c)", border: "none", borderRadius: 12, padding: 14, color: "#fff", fontWeight: 800, cursor: "pointer", fontSize: 16, fontFamily: "'Bebas Neue', cursive", letterSpacing: 2, marginBottom: 12 }}>
                JOIN GROUP
              </button>
              <button onClick={() => setGroupScreen("setup")} style={{ width: "100%", background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 14 }}>← Back</button>
            </div>
          )}

          {groupScreen === "browse" && (
            <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: 24 }}>
              <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 20 }}>Open Groups</div>
              {allOpenGroups.length === 0 && <div style={{ color: "#555", textAlign: "center", padding: "20px 0" }}>No open groups yet</div>}
              {allOpenGroups.map(g => (
                <div key={g.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "12px 16px", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{g.name}</div>
                    <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{(g.members || []).length} members</div>
                  </div>
                  <button onClick={() => handleJoinOpenGroup(g)} style={{ background: "#f97316", border: "none", borderRadius: 8, padding: "8px 16px", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>Join</button>
                </div>
              ))}
              <button onClick={() => setGroupScreen("setup")} style={{ width: "100%", background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 14, marginTop: 8 }}>← Back</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d0f", fontFamily: "'DM Sans', sans-serif", color: "#f0f0f0", position: "relative" }}>
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />

      <div style={{ position: "fixed", top: -100, left: "50%", transform: "translateX(-50%)", width: 600, height: 300, borderRadius: "50%", background: "radial-gradient(ellipse, rgba(249,115,22,0.15) 0%, transparent 70%)", pointerEvents: "none", zIndex: 0 }} />

      {newBadges.length > 0 && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.85)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "linear-gradient(135deg, #1a1a1f, #2a1a00)", border: "2px solid #f97316", borderRadius: 24, padding: "32px 28px", textAlign: "center", maxWidth: 320, width: "100%", boxShadow: "0 0 60px rgba(249,115,22,0.5)" }}>
            <div style={{ fontSize: 11, color: "#f97316", fontFamily: "'Space Mono', monospace", letterSpacing: 3, marginBottom: 16 }}>🎉 BADGE UNLOCKED 🎉</div>
            {newBadges.map(b => (
              <div key={b.id} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 64, marginBottom: 8 }}>{b.emoji}</div>
                <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 28, letterSpacing: 2, marginBottom: 6 }}>{b.label}</div>
                <div style={{ fontSize: 13, color: "#888", lineHeight: 1.5 }}>{b.desc}</div>
              </div>
            ))}
            <button onClick={() => setNewBadges([])} style={{ marginTop: 8, background: "#f97316", border: "none", borderRadius: 12, padding: "12px 32px", color: "#fff", fontWeight: 800, cursor: "pointer", fontSize: 15, fontFamily: "'Bebas Neue', cursive", letterSpacing: 2 }}>
              NICE! 💪
            </button>
          </div>
        </div>
      )}

      {streakBanner && (
        <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", background: "linear-gradient(135deg, #1a1a00, #2a1500)", border: "1.5px solid #f97316", borderRadius: 16, padding: "14px 20px", zIndex: 997, display: "flex", alignItems: "center", gap: 12, boxShadow: "0 4px 24px rgba(249,115,22,0.4)", maxWidth: 360, width: "calc(100% - 32px)" }}>
          <div style={{ fontSize: 32 }}>🔥</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 20, letterSpacing: 1, color: "#f97316" }}>
              {streakBanner.days === 1 ? "STREAK STARTED!" : `${streakBanner.days} DAY STREAK!`}
            </div>
            <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
              {streakBanner.milestone > 0
                ? `+${streakBanner.milestone} bonus point${streakBanner.milestone > 1 ? "s" : ""} earned! Keep it up!`
                : "Log again tomorrow to keep it going!"}
            </div>
          </div>
          <button onClick={() => setStreakBanner(null)} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 20, padding: "0 4px" }}>×</button>
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
          <Avatar name={mentionAlert.user} size={32} avatarProfiles={avatarProfiles} />
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

      {/* Create/Join group modal overlay — shown without losing current group */}
      {groupCreateModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 995, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onClick={() => setGroupCreateModal(null)}>
          <div style={{ background: "#1a1a1f", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: 24, width: "100%", maxWidth: 380 }} onClick={e => e.stopPropagation()}>

            {groupCreateModal === "create" && (
              <>
                <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 24, letterSpacing: 2, marginBottom: 20 }}>CREATE A GROUP</div>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, color: "#888", marginBottom: 6, fontWeight: 600 }}>Group Name</div>
                  <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="e.g. The Boys, Work Crew..."
                    style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "12px 14px", color: "#fff", fontSize: 15, outline: "none", boxSizing: "border-box" }} />
                </div>
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, color: "#888", marginBottom: 10, fontWeight: 600 }}>Group Type</div>
                  <div style={{ display: "flex", gap: 10 }}>
                    {["open", "closed"].map(t => (
                      <button key={t} onClick={() => setNewGroupType(t)} style={{ flex: 1, background: newGroupType === t ? "rgba(249,115,22,0.15)" : "rgba(255,255,255,0.04)", border: `1px solid ${newGroupType === t ? "rgba(249,115,22,0.5)" : "rgba(255,255,255,0.1)"}`, borderRadius: 10, padding: "12px 8px", color: newGroupType === t ? "#f97316" : "#888", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
                        {t === "open" ? "🌐 Open" : "🔒 Closed"}
                        <div style={{ fontSize: 10, fontWeight: 400, marginTop: 4, color: "#666" }}>{t === "open" ? "Anyone can join" : "Invite only"}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={handleCreateGroup} style={{ width: "100%", background: "linear-gradient(135deg, #f97316, #ea580c)", border: "none", borderRadius: 12, padding: 14, color: "#fff", fontWeight: 800, cursor: "pointer", fontSize: 16, fontFamily: "'Bebas Neue', cursive", letterSpacing: 2, marginBottom: 12 }}>
                  CREATE GROUP 🚀
                </button>
              </>
            )}

            {groupCreateModal === "join" && (
              <>
                <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 24, letterSpacing: 2, marginBottom: 20 }}>JOIN WITH CODE</div>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, color: "#888", marginBottom: 6, fontWeight: 600 }}>Invite Code</div>
                  <input value={joinCodeInput} onChange={e => setJoinCodeInput(e.target.value.toUpperCase())} placeholder="e.g. ABC123" maxLength={6}
                    style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "12px 14px", color: "#fff", fontSize: 20, outline: "none", boxSizing: "border-box", textAlign: "center", letterSpacing: 4, fontFamily: "'Space Mono', monospace", fontWeight: 700 }} />
                </div>
                <button onClick={handleRequestJoin} style={{ width: "100%", background: "linear-gradient(135deg, #f97316, #ea580c)", border: "none", borderRadius: 12, padding: 14, color: "#fff", fontWeight: 800, cursor: "pointer", fontSize: 16, fontFamily: "'Bebas Neue', cursive", letterSpacing: 2, marginBottom: 12 }}>
                  JOIN GROUP
                </button>
              </>
            )}

            <button onClick={() => setGroupCreateModal(null)} style={{ width: "100%", background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 14 }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Group switcher modal */}
      {groupSwitcherOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 990, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={() => setGroupSwitcherOpen(false)}>
          <div style={{ background: "#1a1a1f", borderRadius: "20px 20px 0 0", padding: 24, width: "100%", maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 22, letterSpacing: 2, marginBottom: 16 }}>YOUR GROUPS</div>
            {userGroups.map(g => (
              <div key={g.id} onClick={() => switchGroup(g)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: currentGroup?.id === g.id ? "rgba(249,115,22,0.1)" : "rgba(255,255,255,0.04)", border: `1px solid ${currentGroup?.id === g.id ? "rgba(249,115,22,0.3)" : "rgba(255,255,255,0.08)"}`, borderRadius: 12, padding: "14px 16px", marginBottom: 8, cursor: "pointer" }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{g.name}</div>
                  <div style={{ fontSize: 11, color: "#666", marginTop: 2, fontFamily: "'Space Mono', monospace" }}>{g.type === "open" ? "🌐 Open" : "🔒 Closed"} · {(g.members || []).length} members</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {(g.admins || []).includes(userName) && <span style={{ fontSize: 10, background: "rgba(249,115,22,0.15)", color: "#f97316", borderRadius: 6, padding: "2px 8px", fontWeight: 700 }}>ADMIN</span>}
                  {currentGroup?.id === g.id && <span style={{ color: "#f97316" }}>✓</span>}
                </div>
              </div>
            ))}
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button onClick={() => { setGroupSwitcherOpen(false); setGroupCreateModal("create"); }} style={{ flex: 1, background: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.3)", borderRadius: 12, padding: 12, color: "#f97316", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>+ Create New</button>
              <button onClick={() => { setGroupSwitcherOpen(false); setGroupCreateModal("join"); }} style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: 12, color: "#aaa", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>Join with Code</button>
            </div>
            <button onClick={() => setGroupSwitcherOpen(false)} style={{ width: "100%", background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 14, marginTop: 12 }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Group settings modal */}
      {groupSettingsOpen && currentGroup && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 990, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={() => setGroupSettingsOpen(false)}>
          <div style={{ background: "#1a1a1f", borderRadius: "20px 20px 0 0", padding: 24, width: "100%", maxWidth: 480, maxHeight: "80vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 22, letterSpacing: 2, marginBottom: 4 }}>{currentGroup.name}</div>
            <div style={{ fontSize: 11, color: "#666", fontFamily: "'Space Mono', monospace", marginBottom: 20 }}>{currentGroup.type === "open" ? "🌐 OPEN GROUP" : "🔒 CLOSED GROUP"}</div>

            {/* Invite code - admins only */}
            {(currentGroup.admins || []).includes(userName) && (
              <div style={{ background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.2)", borderRadius: 14, padding: 16, marginBottom: 20 }}>
                <div style={{ fontSize: 11, color: "#f97316", fontFamily: "'Space Mono', monospace", letterSpacing: 2, marginBottom: 8 }}>INVITE CODE</div>
                <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 28, fontWeight: 700, letterSpacing: 6, color: "#fff", marginBottom: 8 }}>{currentGroup.code}</div>
                <button onClick={() => { navigator.clipboard.writeText(currentGroup.code); showToast("Code copied! 📋"); }} style={{ background: "#f97316", border: "none", borderRadius: 8, padding: "6px 16px", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>Copy Code</button>
              </div>
            )}

            {/* Pending requests - admins only for closed groups */}
            {(currentGroup.admins || []).includes(userName) && currentGroup.type === "closed" && (currentGroup.pendingMembers || []).length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, color: "#f97316", fontFamily: "'Space Mono', monospace", letterSpacing: 2, marginBottom: 10 }}>PENDING REQUESTS ({(currentGroup.pendingMembers || []).length})</div>
                {(currentGroup.pendingMembers || []).map(m => (
                  <div key={m} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "10px 14px", marginBottom: 8 }}>
                    <div style={{ fontWeight: 600 }}>{m}</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => handleApproveMember(m)} style={{ background: "rgba(74,222,128,0.15)", border: "1px solid rgba(74,222,128,0.3)", borderRadius: 8, padding: "4px 12px", color: "#4ade80", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>✓ Approve</button>
                      <button onClick={() => handleRejectMember(m)} style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, padding: "4px 12px", color: "#ef4444", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>✗ Reject</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Members list */}
            <div style={{ fontSize: 11, color: "#666", fontFamily: "'Space Mono', monospace", letterSpacing: 2, marginBottom: 10 }}>MEMBERS ({(currentGroup.members || []).length})</div>
            {(currentGroup.members || []).map(m => {
              const isAdminMember = (currentGroup.admins || []).includes(m);
              const iAmAdmin = (currentGroup.admins || []).includes(userName);
              const isMe = m === userName;
              return (
                <div key={m} style={{ display: "flex", alignItems: "center", gap: 10, background: isMe ? "rgba(249,115,22,0.06)" : "rgba(255,255,255,0.03)", borderRadius: 10, padding: "10px 14px", marginBottom: 8 }}>
                  <Avatar name={m} size={32} avatarProfiles={avatarProfiles} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{m}{isMe ? " (you)" : ""}</div>
                    {isAdminMember && <div style={{ fontSize: 10, color: "#f97316", fontFamily: "'Space Mono', monospace" }}>ADMIN</div>}
                  </div>
                  {iAmAdmin && !isMe && (
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => handleToggleAdmin(m)} style={{ background: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.2)", borderRadius: 8, padding: "4px 10px", color: "#f97316", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
                        {isAdminMember ? "Remove Admin" : "Make Admin"}
                      </button>
                      <button onClick={() => handleRemoveMember(m)} style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, padding: "4px 8px", color: "#ef4444", cursor: "pointer", fontSize: 13 }}>🗑</button>
                    </div>
                  )}
                </div>
              );
            })}

            <button onClick={handleLeaveGroup} style={{ width: "100%", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 12, padding: 12, color: "#ef4444", fontWeight: 700, cursor: "pointer", fontSize: 14, marginTop: 16 }}>
              Leave Group
            </button>
            <button onClick={() => setGroupSettingsOpen(false)} style={{ width: "100%", background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 14, marginTop: 8 }}>Close</button>
          </div>
        </div>
      )}

      {/* Monthly Recap Modal */}
      {showRecap && monthlyRecap && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 1001, overflowY: "auto", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "24px 16px 40px" }}>
          <div style={{ width: "100%", maxWidth: 420, position: "relative" }}>
            {/* Header */}
            <div style={{ textAlign: "center", marginBottom: 28 }}>
              <div style={{ fontSize: 11, color: "#f97316", fontFamily: "'Space Mono', monospace", letterSpacing: 3, marginBottom: 8 }}>MONTHLY RECAP</div>
              <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 42, letterSpacing: 3, color: "#fff", lineHeight: 1 }}>{monthlyRecap.monthName.toUpperCase()}</div>
              <div style={{ fontSize: 12, color: "#555", fontFamily: "'Space Mono', monospace", marginTop: 4 }}>{monthlyRecap.lastMonthYear}</div>
            </div>

            {/* MVP */}
            <div style={{ background: "linear-gradient(135deg, rgba(249,115,22,0.15), rgba(251,191,36,0.1))", border: "1.5px solid rgba(249,115,22,0.4)", borderRadius: 20, padding: 24, marginBottom: 16, textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "#f97316", fontFamily: "'Space Mono', monospace", letterSpacing: 3, marginBottom: 12 }}>🏆 MONTHLY CHAMPION</div>
              <Avatar name={monthlyRecap.mvp} size={64} avatarProfiles={avatarProfiles} />
              <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 32, letterSpacing: 2, marginTop: 10, color: "#fbbf24" }}>{monthlyRecap.mvp}</div>
              <div style={{ fontSize: 13, color: "#888", marginTop: 4 }}>{monthlyRecap.ranked[0][1].points} pts · {monthlyRecap.ranked[0][1].completedChallenges} challenges · {monthlyRecap.ranked[0][1].reps.toLocaleString()} reps</div>
            </div>

            {/* Points Leaderboard */}
            <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 18, marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: "#666", fontFamily: "'Space Mono', monospace", letterSpacing: 2, marginBottom: 12 }}>POINTS LEADERBOARD</div>
              {monthlyRecap.ranked.map(([user, stats], i) => (
                <div key={user} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: i < monthlyRecap.ranked.length - 1 ? 10 : 0 }}>
                  <div style={{ fontSize: 18, width: 28, textAlign: "center" }}>{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i+1}.`}</div>
                  <Avatar name={user} size={32} avatarProfiles={avatarProfiles} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{user}</div>
                    <div style={{ fontSize: 11, color: "#666" }}>{stats.completedChallenges} completed · {stats.reps.toLocaleString()} reps</div>
                  </div>
                  <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 22, color: i === 0 ? "#fbbf24" : "#f97316" }}>{stats.points}<span style={{ fontSize: 11, color: "#666", fontFamily: "'Space Mono', monospace" }}> pts</span></div>
                </div>
              ))}
            </div>

            {/* Individual Awards */}
            <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 18, marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: "#666", fontFamily: "'Space Mono', monospace", letterSpacing: 2, marginBottom: 14 }}>INDIVIDUAL AWARDS</div>
              {[
                { icon: "💪", label: "Most Reps", winner: monthlyRecap.mostReps, stat: `${monthlyRecap.mostRepsCount.toLocaleString()} reps` },
                { icon: "✅", label: "Most Challenges", winner: monthlyRecap.mostCompleted, stat: `${monthlyRecap.mostCompletedCount} completed` },
                { icon: "🔥", label: "Longest Streak", winner: monthlyRecap.longestStreak, stat: `${monthlyRecap.longestStreakDays} days` },
              ].map(award => (
                <div key={award.label} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <div style={{ fontSize: 24, width: 36, textAlign: "center" }}>{award.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: "#666", fontFamily: "'Space Mono', monospace" }}>{award.label}</div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{award.winner}</div>
                  </div>
                  <div style={{ fontSize: 12, color: "#f97316", fontFamily: "'Space Mono', monospace", fontWeight: 700 }}>{award.stat}</div>
                </div>
              ))}
            </div>

            {/* Group totals */}
            <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 18, marginBottom: 24 }}>
              <div style={{ fontSize: 11, color: "#666", fontFamily: "'Space Mono', monospace", letterSpacing: 2, marginBottom: 14 }}>SQUAD TOTALS</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {[
                  { label: "Total Reps", value: monthlyRecap.totalReps.toLocaleString() },
                  { label: "Challenges Done", value: monthlyRecap.totalCompleted },
                  { label: "Active Members", value: monthlyRecap.ranked.length },
                  { label: "Month", value: monthlyRecap.monthName.slice(0, 3).toUpperCase() },
                ].map(s => (
                  <div key={s.label} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 12, padding: "12px 14px", textAlign: "center" }}>
                    <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 24, color: "#f97316" }}>{s.value}</div>
                    <div style={{ fontSize: 10, color: "#666", fontFamily: "'Space Mono', monospace", marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <button onClick={() => {
              localStorage.setItem(monthlyRecap.recapKey, "seen");
              setShowRecap(false);
            }} style={{ width: "100%", background: "linear-gradient(135deg, #f97316, #ea580c)", border: "none", borderRadius: 14, padding: 16, color: "#fff", fontWeight: 800, cursor: "pointer", fontSize: 18, fontFamily: "'Bebas Neue', cursive", letterSpacing: 2 }}>
              SEE YOU NEXT MONTH 💪
            </button>
          </div>
        </div>
      )}

      {/* Avatar Picker Modal */}
      {avatarPickerOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 995, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={() => setAvatarPickerOpen(false)}>
          <div style={{ background: "#1a1a1f", borderRadius: "20px 20px 0 0", padding: 24, width: "100%", maxWidth: 480, maxHeight: "85vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 22, letterSpacing: 2, marginBottom: 20 }}>CUSTOMIZE AVATAR</div>

            {/* Preview */}
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
              <Avatar name={userName} size={80} avatarProfiles={{ [userName]: avatarDraft }} />
            </div>

            {/* Type tabs */}
            <div style={{ display: "flex", gap: 6, marginBottom: 16, overflowX: "auto" }}>
              {[{ id: "emoji", label: "😀 Emoji" }, { id: "face", label: "🙂 Face" }, { id: "letter", label: "A Letter" }, { id: "two", label: "AB Two" }].map(t => (
                <button key={t.id} onClick={() => setAvatarTab(t.id)}
                  style={{ flexShrink: 0, background: avatarTab === t.id ? "rgba(249,115,22,0.15)" : "rgba(255,255,255,0.04)", border: `1px solid ${avatarTab === t.id ? "rgba(249,115,22,0.5)" : "rgba(255,255,255,0.1)"}`, borderRadius: 10, padding: "8px 14px", color: avatarTab === t.id ? "#f97316" : "#888", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Emoji picker */}
            {avatarTab === "emoji" && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: "#666", fontFamily: "'Space Mono', monospace", marginBottom: 8 }}>PICK AN EMOJI</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {["🏋️","💪","🔥","🏃","🧘","🤸","⚡","🥊","🏆","🎯","🚀","💥","🌊","🐢","👑","🎖️","🤯","😤","😎","🥇","🦁","🐺","🦊","🐯","🦅","🌟","❤️","🍕","🎸","🎮"].map(e => (
                    <button key={e} onClick={() => setAvatarDraft(d => ({ ...d, type: "emoji", value: e }))}
                      style={{ width: 42, height: 42, background: avatarDraft.value === e && avatarDraft.type === "emoji" ? "rgba(249,115,22,0.2)" : "rgba(255,255,255,0.04)", border: `1px solid ${avatarDraft.value === e && avatarDraft.type === "emoji" ? "rgba(249,115,22,0.5)" : "rgba(255,255,255,0.08)"}`, borderRadius: 10, fontSize: 22, cursor: "pointer" }}>
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Face picker */}
            {avatarTab === "face" && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: "#666", fontFamily: "'Space Mono', monospace", marginBottom: 8 }}>PICK A FACE</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {["😀","😎","🤩","😤","😤","🥳","🤔","😏","😁","🙂","😈","👿","🤠","🧐","🥸","😴","🤑","😤","💀","👽","🤖","👾","🦸","🧙","🥷","💆","🙆","🤦","🤷","💪"].map(e => (
                    <button key={e} onClick={() => setAvatarDraft(d => ({ ...d, type: "face", value: e }))}
                      style={{ width: 42, height: 42, background: avatarDraft.value === e && avatarDraft.type === "face" ? "rgba(249,115,22,0.2)" : "rgba(255,255,255,0.04)", border: `1px solid ${avatarDraft.value === e && avatarDraft.type === "face" ? "rgba(249,115,22,0.5)" : "rgba(255,255,255,0.08)"}`, borderRadius: 10, fontSize: 22, cursor: "pointer" }}>
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Letter picker */}
            {avatarTab === "letter" && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: "#666", fontFamily: "'Space Mono', monospace", marginBottom: 8 }}>PICK A LETTER</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map(l => (
                    <button key={l} onClick={() => setAvatarDraft(d => ({ ...d, type: "letter", value: l }))}
                      style={{ width: 38, height: 38, background: avatarDraft.value === l && avatarDraft.type === "letter" ? "rgba(249,115,22,0.2)" : "rgba(255,255,255,0.04)", border: `1px solid ${avatarDraft.value === l && avatarDraft.type === "letter" ? "rgba(249,115,22,0.5)" : "rgba(255,255,255,0.08)"}`, borderRadius: 8, color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 15, fontFamily: "'Bebas Neue', cursive" }}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Two letters */}
            {avatarTab === "two" && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: "#666", fontFamily: "'Space Mono', monospace", marginBottom: 8 }}>TYPE UP TO 2 LETTERS</div>
                <input value={avatarDraft.type === "two" ? avatarDraft.value : ""} maxLength={2}
                  onChange={e => setAvatarDraft(d => ({ ...d, type: "two", value: e.target.value.toUpperCase() }))}
                  placeholder="e.g. DD"
                  style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "12px 14px", color: "#fff", fontSize: 28, outline: "none", boxSizing: "border-box", textAlign: "center", letterSpacing: 8, fontFamily: "'Bebas Neue', cursive", fontWeight: 700 }} />
              </div>
            )}

            {/* Background color */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: "#666", fontFamily: "'Space Mono', monospace", marginBottom: 8 }}>CIRCLE COLOR</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {AVATAR_COLORS.map(c => (
                  <button key={c} onClick={() => setAvatarDraft(d => ({ ...d, bgColor: c }))}
                    style={{ width: 36, height: 36, borderRadius: "50%", background: c, border: `3px solid ${avatarDraft.bgColor === c ? "#fff" : "transparent"}`, cursor: "pointer" }} />
                ))}
              </div>
            </div>

            {/* Text color */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, color: "#666", fontFamily: "'Space Mono', monospace", marginBottom: 8 }}>TEXT / EMOJI COLOR</div>
              <div style={{ display: "flex", gap: 8 }}>
                {AVATAR_TEXT_COLORS.map(c => (
                  <button key={c} onClick={() => setAvatarDraft(d => ({ ...d, textColor: c }))}
                    style={{ width: 36, height: 36, borderRadius: "50%", background: c, border: `3px solid ${avatarDraft.textColor === c ? "#f97316" : "rgba(255,255,255,0.2)"}`, cursor: "pointer" }} />
                ))}
              </div>
            </div>

            <button onClick={handleSaveAvatar} style={{ width: "100%", background: "linear-gradient(135deg, #f97316, #ea580c)", border: "none", borderRadius: 12, padding: 14, color: "#fff", fontWeight: 800, cursor: "pointer", fontSize: 16, fontFamily: "'Bebas Neue', cursive", letterSpacing: 2, marginBottom: 12 }}>
              SAVE AVATAR
            </button>
            <button onClick={() => setAvatarPickerOpen(false)} style={{ width: "100%", background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 14 }}>Cancel</button>
          </div>
        </div>
      )}

      {badgeModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 990, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onClick={() => setBadgeModal(null)}>
          <div style={{ background: "#1a1a1f", border: `1.5px solid ${badgeModal.earned ? "rgba(249,115,22,0.5)" : "rgba(255,255,255,0.1)"}`, borderRadius: 20, padding: 28, maxWidth: 320, width: "100%", textAlign: "center" }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 52, marginBottom: 8, filter: badgeModal.earned ? "none" : "grayscale(1)", opacity: badgeModal.earned ? 1 : 0.4 }}>{badgeModal.badge.emoji}</div>
            <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 22, letterSpacing: 2, marginBottom: 8 }}>{badgeModal.badge.label}</div>
            <div style={{ fontSize: 13, color: "#888", lineHeight: 1.6, marginBottom: 16 }}>{badgeModal.badge.desc}</div>
            {badgeModal.earned
              ? <div style={{ background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.3)", borderRadius: 10, padding: "8px 16px", fontSize: 13, color: "#4ade80", fontWeight: 700 }}>✅ Earned!</div>
              : <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "8px 16px", fontSize: 13, color: "#666" }}>🔒 Not yet earned</div>
            }
            <button onClick={() => setBadgeModal(null)} style={{ marginTop: 16, background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 14 }}>Close</button>
          </div>
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
            {currentGroup && (
              <button onClick={() => setGroupSwitcherOpen(true)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                <span style={{ fontSize: 12, color: "#f97316", fontFamily: "'Space Mono', monospace" }}>{currentGroup.name}</span>
                <span style={{ fontSize: 10, color: "#666" }}>▾</span>
              </button>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {(() => {
              const tzOffset = new Date().getTimezoneOffset() * -60000;
              const streak = getCurrentStreak(userName, challenges, tzOffset);
              return streak > 0 ? (
                <div style={{ background: "rgba(249,115,22,0.12)", border: "1px solid rgba(249,115,22,0.3)", borderRadius: 20, padding: "4px 12px", display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 16 }}>🔥</span>
                  <span style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 18, color: "#f97316", letterSpacing: 1 }}>{streak}</span>
                </div>
              ) : null;
            })()}
            {userName && <Avatar name={userName} size={42} avatarProfiles={avatarProfiles} onClick={() => { setAvatarPickerOpen(true); setAvatarDraft(avatarProfiles[userName] || { type: "letter", value: userName[0]?.toUpperCase(), bgColor: "#f97316", textColor: "#ffffff" }); }} />}
          </div>
        </div>



        {screen === "challenge" && (
          <button onClick={() => { setScreen("home"); setSelectedChallenge(null); }} style={{ background: "none", border: "none", color: "#f97316", cursor: "pointer", fontSize: 14, fontWeight: 600, padding: "4px 0", marginBottom: 12, display: "flex", alignItems: "center", gap: 4 }}>
            ← Back
          </button>
        )}

        {/* HOME */}
        {screen === "home" && (
          <div>
            {userName && (() => {
              const lbReactionCount = challenges.reduce((total, ch) => {
                  const reactions = ch.lbReactions || {};
                  return total + Object.values(reactions).reduce((t, emojiMap) =>
                    t + Object.values(emojiMap).filter(users => users.includes(userName)).length, 0);
                }, 0);
                const badges = getUserBadges(userName, challenges, messages, lbReactionCount);
              return badges.length > 0 ? (
                <div style={{ marginBottom: 20 }}>
                  <button onClick={() => setBadgesExpanded(e => !e)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", marginBottom: badgesExpanded ? 10 : 0 }}>
                    <SectionLabel>YOUR BADGES ({badges.length})</SectionLabel>
                    <span style={{ color: "#f97316", fontSize: 18, marginTop: -10 }}>{badgesExpanded ? "▲" : "▼"}</span>
                  </button>
                  {badgesExpanded && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{badges.map(b => <BadgeChip key={b.id} badge={b} earned={true} onTap={() => setBadgeModal({ badge: b, earned: true })} />)}</div>
                  )}
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
              const sorted = [...challenges].sort((a, b) => {
                const aAccepted = (a.accepted || []).includes(userName) ? 1 : 0;
                const bAccepted = (b.accepted || []).includes(userName) ? 1 : 0;
                if (bAccepted !== aAccepted) return bAccepted - aAccepted;
                return b.createdAt - a.createdAt;
              });
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
                  <div key={ch.id} style={{ background: isAccepted(ch) ? "rgba(74,222,128,0.04)" : "rgba(255,255,255,0.04)", border: `1px solid ${isAccepted(ch) ? "rgba(74,222,128,0.35)" : newChallenge ? "rgba(249,115,22,0.35)" : "rgba(255,255,255,0.08)"}`, borderRadius: 18, padding: 18, marginBottom: 12, position: "relative", opacity: showArchive ? 0.75 : 1, boxShadow: isAccepted(ch) ? "0 0 12px rgba(74,222,128,0.08)" : "none" }}>
                    {newChallenge && (
                      <div style={{ position: "absolute", top: -10, left: 16, background: "linear-gradient(90deg, #f97316, #fbbf24)", borderRadius: 99, padding: "2px 10px", fontSize: 10, fontWeight: 900, color: "#fff", fontFamily: "'Space Mono', monospace", letterSpacing: 1 }}>✨ NEW</div>
                    )}
                    {ch.createdBy === userName && (
                      <button onClick={e => { e.stopPropagation(); setDeleteConfirm(ch.id); }} title="Delete challenge"
                        style={{ position: "absolute", top: 14, right: 14, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, padding: "4px 8px", color: "#ef4444", cursor: "pointer", fontSize: 13, lineHeight: 1 }}>🗑</button>
                    )}
                    <div onClick={() => { setSelectedChallenge(ch); setScreen("challenge"); }} style={{ cursor: "pointer" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12, paddingRight: 36 }}>
                        <div style={{ fontSize: 28 }}>{ch.emoji}</div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 15 }}>{ch.name}</div>
                          <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>Goal: {ch.goal.toLocaleString()} {ch.unit}</div>
                          {ch.dailyGoal && (() => {
                            const todayTotal = getDailyTotal(ch, userName, new Date().toISOString().slice(0, 10));
                            const todayDone = todayTotal >= ch.dailyGoal;
                            return <div style={{ fontSize: 11, marginTop: 3, color: todayDone ? "#4ade80" : "#aaa" }}>{todayDone ? "✅ Today's goal hit!" : `📅 Today: ${todayTotal}/${ch.dailyGoal} ${ch.unit}`}</div>;
                          })()}
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
                {ch.createdBy === userName && (
                  <button onClick={() => setDeleteConfirm(ch.id)} style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, padding: "8px 10px", color: "#ef4444", cursor: "pointer", fontSize: 16, flexShrink: 0 }}>🗑</button>
                )}
              </div>
              {ch.createdBy && (
                <div style={{ textAlign: "center", marginBottom: 16 }}>
                  <span style={{ fontSize: 12, color: "#666", fontFamily: "'Space Mono', monospace" }}>POSTED BY </span>
                  <span style={{ fontSize: 12, color: "#f97316", fontFamily: "'Space Mono', monospace", fontWeight: 700 }}>{ch.createdBy}</span>
                </div>
              )}
              {ch.description && (
                <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 16, marginBottom: 16, fontSize: 14, color: "#ccc", lineHeight: 1.6 }}>
                  <div style={{ fontSize: 11, color: "#666", fontFamily: "'Space Mono', monospace", letterSpacing: 2, marginBottom: 8 }}>DESCRIPTION</div>
                  {ch.description}
                </div>
              )}
              {!isAccepted(ch) && !isExpired(ch) && !completed && userName && (
                <button onClick={() => handleAccept(ch.id)} style={{ width: "100%", background: "rgba(74,222,128,0.1)", border: "1.5px solid rgba(74,222,128,0.4)", borderRadius: 14, padding: "14px", color: "#4ade80", fontWeight: 800, cursor: "pointer", fontSize: 15, fontFamily: "'Bebas Neue', cursive", letterSpacing: 2, marginBottom: 16 }}>
                  ✅ ACCEPT CHALLENGE
                </button>
              )}
              {isAccepted(ch) && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.25)", borderRadius: 14, padding: "10px 16px", marginBottom: 16 }}>
                  <span style={{ fontSize: 16 }}>✅</span>
                  <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, fontWeight: 700, color: "#4ade80" }}>YOU ACCEPTED THIS CHALLENGE</span>
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
              {completed && (
                <div style={{ background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.3)", borderRadius: 16, padding: "12px 18px", marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 22 }}>🎉</span>
                  <div>
                    <div style={{ fontWeight: 700, color: "#4ade80", fontSize: 14 }}>Goal crushed! Keep going to flex on everyone 💪</div>
                    <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>Your total: {myTotal.toLocaleString()} {ch.unit}</div>
                  </div>
                </div>
              )}
              {!isExpired(ch) && (
                <div style={{ background: "rgba(249,115,22,0.07)", border: "1px solid rgba(249,115,22,0.25)", borderRadius: 16, padding: 18, marginBottom: 20 }}>
                  <div style={{ fontWeight: 700, marginBottom: 12 }}>Log Your Progress</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input type="number" value={logAmount} onChange={e => setLogAmount(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLog()} placeholder={`${ch.unit}...`}
                      style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, padding: "10px 14px", color: "#fff", fontSize: 15, outline: "none" }} />
                    <button onClick={handleLog} style={{ background: "#f97316", border: "none", borderRadius: 10, padding: "10px 20px", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 15 }}>Log</button>
                  </div>
                </div>
              )}
              {isExpired(ch) && (
                <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 16, padding: 18, marginBottom: 20, textAlign: "center" }}>
                  <div style={{ fontSize: 22, marginBottom: 4 }}>⏰</div>
                  <div style={{ fontWeight: 700, color: "#ef4444" }}>Time's Up!</div>
                  <div style={{ fontSize: 13, color: "#888", marginTop: 4 }}>This challenge has ended. Final standings are locked in.</div>
                </div>
              )}
              <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 18, marginBottom: ch.dailyGoal ? 12 : 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                  <div style={{ fontWeight: 700 }}>Your Progress</div>
                  <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 13, color: "#f97316" }}>{myTotal.toLocaleString()} / {ch.goal.toLocaleString()}</div>
                </div>
                <ProgressBar pct={myPct} color={completed ? "#4ade80" : "#f97316"} />
              </div>

              {ch.dailyGoal && (() => {
                const todayStr = new Date().toISOString().slice(0, 10);
                const todayTotal = getDailyTotal(ch, userName, todayStr);
                const todayPct = Math.min(100, (todayTotal / ch.dailyGoal) * 100);
                const todayDone = todayTotal >= ch.dailyGoal;
                const grid = getDailyGrid(ch, userName);
                return (
                  <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 18, marginBottom: 20 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <div style={{ fontWeight: 700 }}>Today's Goal</div>
                      <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 13, color: todayDone ? "#4ade80" : "#f97316" }}>
                        {todayDone ? "✅ Done!" : `${todayTotal} / ${ch.dailyGoal} ${ch.unit}`}
                      </div>
                    </div>
                    <ProgressBar pct={todayPct} color={todayDone ? "#4ade80" : "#f97316"} />
                    {grid.length > 0 && (
                      <div style={{ marginTop: 14 }}>
                        <div style={{ fontSize: 11, color: "#666", fontFamily: "'Space Mono', monospace", letterSpacing: 1, marginBottom: 8 }}>DAILY STREAK</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                          {grid.map(day => (
                            <div key={day.dateStr} title={`Day ${day.dayNum}: ${day.dayTotal} ${ch.unit}`}
                              style={{ width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, fontFamily: "'Space Mono', monospace",
                                background: day.hit ? "rgba(74,222,128,0.2)" : day.isToday ? "rgba(249,115,22,0.15)" : day.isPast ? "rgba(239,68,68,0.1)" : "rgba(255,255,255,0.04)",
                                border: `1px solid ${day.hit ? "rgba(74,222,128,0.4)" : day.isToday ? "rgba(249,115,22,0.5)" : day.isPast ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.08)"}`,
                                color: day.hit ? "#4ade80" : day.isToday ? "#f97316" : day.isPast ? "#ef4444" : "#555"
                              }}>
                              {day.hit ? "✓" : day.dayNum}
                            </div>
                          ))}
                        </div>
                        <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: 10 }}>
                          <span style={{ color: "#4ade80" }}>✓ Hit</span>
                          <span style={{ color: "#ef4444" }}>✗ Missed</span>
                          <span style={{ color: "#f97316" }}>Today</span>
                          <span style={{ color: "#555" }}>Upcoming</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {isArchived(ch) && (
                <button onClick={() => {
                  setNewChallenge({
                    name: ch.name,
                    unit: ch.unit,
                    goal: ch.goalType === "daily" ? "" : ch.goal.toString(),
                    emoji: ch.emoji,
                    durationDays: ch.durationDays ? ch.durationDays.toString() : "",
                    videoUrl: ch.videoUrl || "",
                    description: ch.description || "",
                    goalType: ch.goalType || "total",
                    dailyGoal: ch.dailyGoal ? ch.dailyGoal.toString() : "",
                  });
                  setScreen("create");
                  setSelectedChallenge(null);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }} style={{ width: "100%", background: "rgba(249,115,22,0.08)", border: "1.5px solid rgba(249,115,22,0.3)", borderRadius: 14, padding: 14, color: "#f97316", fontWeight: 800, cursor: "pointer", fontSize: 16, fontFamily: "'Bebas Neue', cursive", letterSpacing: 2, marginBottom: 20 }}>
                  🔁 RUN IT BACK!
                </button>
              )}
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
                    <Avatar name={entry.user} size={34} avatarProfiles={avatarProfiles} />
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
                            {["👍","🔥","💪","😂","🥇","👀","❤️","🤯","👏"].map(e => (
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
              <div>
                <div style={{ fontSize: 12, color: "#888", marginBottom: 8, fontWeight: 600 }}>Goal Type</div>
                <div style={{ display: "flex", gap: 10 }}>
                  {[{ id: "total", label: "🎯 Total Goal", sub: "e.g. 1,000 pushups total" }, { id: "daily", label: "📅 Daily Goal", sub: "e.g. 50 pushups/day" }].map(t => (
                    <button key={t.id} onClick={() => setNewChallenge(p => ({ ...p, goalType: t.id }))}
                      style={{ flex: 1, background: newChallenge.goalType === t.id ? "rgba(249,115,22,0.15)" : "rgba(255,255,255,0.04)", border: `1px solid ${newChallenge.goalType === t.id ? "rgba(249,115,22,0.5)" : "rgba(255,255,255,0.1)"}`, borderRadius: 10, padding: "10px 8px", color: newChallenge.goalType === t.id ? "#f97316" : "#888", fontWeight: 700, cursor: "pointer", fontSize: 13, textAlign: "center" }}>
                      {t.label}
                      <div style={{ fontSize: 10, fontWeight: 400, marginTop: 3, color: "#555" }}>{t.sub}</div>
                    </button>
                  ))}
                </div>
              </div>
              {[
                { label: "Challenge Name", key: "name", placeholder: "e.g. 30-Day Pushup Challenge" },
                { label: "Unit", key: "unit", placeholder: "e.g. pushups, miles, steps" },
                ...(newChallenge.goalType === "daily"
                  ? [{ label: "Daily Goal", key: "dailyGoal", placeholder: "e.g. 50", type: "number" }]
                  : [{ label: "Total Goal", key: "goal", placeholder: "e.g. 1000", type: "number" }]),
                { label: "Duration (days" + (newChallenge.goalType === "daily" ? ", required)" : ", optional)"), key: "durationDays", placeholder: newChallenge.goalType === "daily" ? "e.g. 30" : "e.g. 30  —  leave blank for no limit", type: "number" },
                { label: "Emoji", key: "emoji", placeholder: "💪" },
                { label: "Instructional Video (YouTube URL, optional)", key: "videoUrl", placeholder: "https://youtube.com/watch?v=..." },
              ].map(f => (
                <div key={f.key}>
                  <div style={{ fontSize: 12, color: "#888", marginBottom: 6, fontWeight: 600 }}>{f.label}</div>
                  <input type={f.type || "text"} value={newChallenge[f.key] || ""} onChange={e => setNewChallenge(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder}
                    style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "12px 14px", color: "#fff", fontSize: 15, outline: "none", boxSizing: "border-box" }} />
                </div>
              ))}
              {newChallenge.goalType === "daily" && newChallenge.dailyGoal && newChallenge.durationDays && (
                <div style={{ background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.2)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#4ade80" }}>
                  Total: {(parseFloat(newChallenge.dailyGoal) * parseInt(newChallenge.durationDays)).toLocaleString()} {newChallenge.unit || "reps"} ({newChallenge.dailyGoal}/day × {newChallenge.durationDays} days)
                </div>
              )}
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
                              {["👍","🔥","💪","😂","🥇","👀","❤️","🤯","👏"].map(e => (
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
                          <Avatar name={u} size={24} avatarProfiles={avatarProfiles} /> @{u}
                        </button>
                      ))}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                    <textarea
                      value={chatInput}
                      onChange={e => { handleChatInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 104) + "px"; }}
                      onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && mentionList.length === 0) { e.preventDefault(); handleSendMessage(); } }}
                      placeholder="Say something... (type @ to mention)"
                      rows={1}
                      style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 18, padding: "10px 16px", color: "#fff", fontSize: 15, outline: "none", resize: "none", fontFamily: "inherit", lineHeight: "1.5", overflowY: "auto", maxHeight: 104 }}
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
                    <Avatar name={entry.user} size={40} avatarProfiles={avatarProfiles} />
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
              const lbReactionCount = challenges.reduce((total, ch) => {
                  const reactions = ch.lbReactions || {};
                  return total + Object.values(reactions).reduce((t, emojiMap) =>
                    t + Object.values(emojiMap).filter(users => users.includes(userName)).length, 0);
                }, 0);
                const badges = getUserBadges(userName, challenges, messages, lbReactionCount);
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
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 24, letterSpacing: 2 }}>{userName}</div>
                        <button onClick={() => setGroupSettingsOpen(true)} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "4px 10px", color: "#aaa", fontSize: 11, cursor: "pointer", fontWeight: 700 }}>⚙️ Group</button>
                        <button onClick={handleSignOut} style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, padding: "4px 10px", color: "#ef4444", fontSize: 11, cursor: "pointer", fontWeight: 700 }}>Sign Out</button>
                      </div>
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
                  {notifPermission === "granted" && (
                    <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 18, marginBottom: 24 }}>
                      <div style={{ fontSize: 11, color: "#666", fontFamily: "'Space Mono', monospace", letterSpacing: 2, marginBottom: 12 }}>DAILY REMINDER TIME 🔔</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <input
                          type="time"
                          value={reminderTime}
                          onChange={e => handleUpdateReminderTime(e.target.value)}
                          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "10px 14px", color: "#fff", fontSize: 15, outline: "none", fontFamily: "inherit", flex: 1 }}
                        />
                        <div style={{ fontSize: 12, color: "#888" }}>your local time</div>
                      </div>
                      <div style={{ fontSize: 11, color: "#555", marginTop: 8 }}>You'll be reminded about active challenges at this time each day</div>
                    </div>
                  )}

                  <div style={{ marginBottom: 24 }}>
                    <button onClick={() => setBadgesExpanded(e => !e)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", marginBottom: badgesExpanded ? 10 : 0 }}>
                      <SectionLabel>BADGES ({badges.length}/{BADGE_DEFS.length})</SectionLabel>
                      <span style={{ color: "#f97316", fontSize: 18, marginTop: -10 }}>{badgesExpanded ? "▲" : "▼"}</span>
                    </button>
                    {badgesExpanded && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {BADGE_DEFS.map(b => {
                          const earned = badges.find(e => e.id === b.id);
                          return <BadgeChip key={b.id} badge={b} earned={!!earned} onTap={() => setBadgeModal({ badge: b, earned: !!earned })} />;
                        })}
                      </div>
                    )}
                  </div>
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
