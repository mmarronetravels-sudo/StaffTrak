import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  fetchNotifications,
  fetchUnreadCount,
  markRead,
  markAllRead,
} from '../services/notificationService'

// ============================================================
// NotificationBell — in-app notifications (#5 wave)
// ------------------------------------------------------------
// Bell + unread badge in the navbar with a dropdown of recent notifications.
// Clicking an item marks it read and deep-links to the related page. Polls the
// unread count on a light interval so the badge stays fresh.
// ============================================================

function timeAgo(iso) {
  if (!iso) return ''
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function NotificationBell() {
  const { profile, isEvaluator } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const ref = useRef(null)

  // Deep-link target for a notification, aware of the viewer's role.
  const linkFor = (n) => {
    switch (n.notification_type) {
      case 'feedback_delivered': return '/my-checklist'
      case 'feedback_acknowledged': return '/checklists'
      case 'comment_requires_response': return '/my-observations'
      case 'comment_response': return '/observations'
      case 'observation_scheduled': return '/my-observations'
      case 'meeting_scheduled': return '/my-meetings'
      case 'goal_review_submitted': return '/checklists'
      case 'task_due_reminder':
        return isEvaluator ? '/checklists' : '/my-checklist'
      case 'required_response_reminder':
        return isEvaluator ? '/observations' : '/my-observations'
      default:
        if (n.related_entity_type === 'observation') {
          return isEvaluator ? '/observations' : '/my-observations'
        }
        return '/dashboard'
    }
  }

  const refresh = async () => {
    if (!profile?.id) return
    setUnread(await fetchUnreadCount(profile.id))
  }

  const loadList = async () => {
    if (!profile?.id) return
    setItems(await fetchNotifications(profile.id, 20))
  }

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 60000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  // Close on outside click.
  useEffect(() => {
    const onDown = (e) => {
      if (open && ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const toggle = async () => {
    const next = !open
    setOpen(next)
    if (next) await loadList()
  }

  const onItemClick = async (n) => {
    if (!n.is_read) {
      await markRead(n.id)
      setItems((list) => list.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)))
      setUnread((u) => Math.max(0, u - 1))
    }
    setOpen(false)
    navigate(linkFor(n))
  }

  const onMarkAll = async () => {
    await markAllRead(profile.id)
    setItems((list) => list.map((x) => ({ ...x, is_read: true })))
    setUnread(0)
  }

  if (!profile) return null

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggle}
        aria-label="Notifications"
        className="relative p-2 rounded-md text-blue-200 hover:text-white hover:bg-white/10 transition-all"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1 w-80 bg-white rounded-lg shadow-xl border border-gray-100 z-50">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
            <span className="text-sm font-semibold text-[#2c3e7e]">Notifications</span>
            {items.some((i) => !i.is_read) && (
              <button onClick={onMarkAll} className="text-xs text-[#477fc1] hover:underline">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-6 text-sm text-[#666666] text-center">You're all caught up.</p>
            ) : (
              <ul className="divide-y divide-gray-50">
                {items.map((n) => (
                  <li key={n.id}>
                    <button
                      onClick={() => onItemClick(n)}
                      className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${
                        n.is_read ? '' : 'bg-blue-50/40'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        {!n.is_read && <span className="mt-1.5 w-2 h-2 rounded-full bg-[#477fc1] shrink-0" />}
                        <div className={`flex-1 min-w-0 ${n.is_read ? 'pl-4' : ''}`}>
                          <p className="text-sm font-medium text-[#2c3e7e]">{n.title}</p>
                          {n.message && <p className="text-xs text-[#666666] mt-0.5">{n.message}</p>}
                          <p className="text-[11px] text-gray-400 mt-1">{timeAgo(n.created_at)}</p>
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
