import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchNotifications, markRead } from '../services/notificationService'

// ============================================================
// NeedsAttentionPanel — Dashboard "Needs your attention" (#5 wave)
// ------------------------------------------------------------
// Lists the viewer's unread notifications as a Dashboard card. Hidden entirely
// when there's nothing unread, so it never adds clutter. Clicking an item marks
// it read and deep-links to the related page.
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

export default function NeedsAttentionPanel() {
  const { profile, isEvaluator } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState([])

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

  useEffect(() => {
    let active = true
    if (profile?.id) {
      fetchNotifications(profile.id, 30).then((list) => {
        if (active) setItems((list || []).filter((n) => !n.is_read))
      })
    }
    return () => { active = false }
  }, [profile?.id])

  const onClick = async (n) => {
    await markRead(n.id)
    setItems((list) => list.filter((x) => x.id !== n.id))
    navigate(linkFor(n))
  }

  if (items.length === 0) return null

  return (
    <div className="bg-white rounded-lg shadow border-l-4 border-[#f3843e] mb-8">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
        <h3 className="font-semibold text-[#2c3e7e]">🔔 Needs your attention</h3>
        <span className="text-xs px-2 py-0.5 rounded-full bg-[#f3843e] text-white">{items.length}</span>
      </div>
      <ul className="divide-y divide-gray-50">
        {items.slice(0, 6).map((n) => (
          <li key={n.id}>
            <button
              onClick={() => onClick(n)}
              className="w-full text-left px-5 py-3 hover:bg-gray-50 transition-colors"
            >
              <p className="text-sm font-medium text-[#2c3e7e]">{n.title}</p>
              {n.message && <p className="text-xs text-[#666666] mt-0.5">{n.message}</p>}
              <p className="text-[11px] text-gray-400 mt-1">{timeAgo(n.created_at)}</p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
