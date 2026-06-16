import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'

// ============================================================
// Comment → required-response loop for one observation (#4).
// - Observer posts comments and can flag a comment "requires response".
// - The observed staff member replies; replying to an open required-response
//   comment auto-resolves it. The observer can also resolve/reopen manually.
// - onOpenCountChange(n) reports how many required-response items are still open.
// ============================================================

const fmt = (d) =>
  d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''

export default function ObservationThread({ observationId, viewer, isObserver, isStaff, onOpenCountChange, observationDelivered = true, onDelivered }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  // New top-level comment
  const [body, setBody] = useState('')
  const [requiresResponse, setRequiresResponse] = useState(false)
  // Reply state
  const [replyTo, setReplyTo] = useState(null)
  const [replyBody, setReplyBody] = useState('')
  // #12 reusable snippets (evaluator's library)
  const [snippets, setSnippets] = useState([])

  const canPost = isObserver || isStaff

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('observation_threads')
      .select('id, parent_id, author_id, body, requires_response, resolved_at, resolved_by, created_at, author:author_id(full_name)')
      .eq('observation_id', observationId)
      .order('created_at', { ascending: true })
    setRows(data || [])
    setLoading(false)
  }, [observationId])

  const loadSnippets = useCallback(async () => {
    if (!isObserver) return
    const { data } = await supabase
      .from('feedback_snippets')
      .select('id, text')
      .eq('owner_id', viewer.id)
      .order('created_at', { ascending: true })
    setSnippets(data || [])
  }, [isObserver, viewer.id])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadSnippets() }, [loadSnippets])

  // #12 mark feedback delivered the first time the observer contributes.
  const markDeliveredIfNeeded = async () => {
    if (!isObserver || observationDelivered) return
    const now = new Date().toISOString()
    const { error } = await supabase.from('observations').update({ feedback_delivered_at: now }).eq('id', observationId)
    if (!error) onDelivered?.(now)
  }

  const insertSnippet = (text) => setBody((b) => (b.trim() ? `${b}\n${text}` : text))

  const saveSnippet = async () => {
    if (!body.trim()) return
    const { error } = await supabase
      .from('feedback_snippets')
      .insert({ tenant_id: viewer.tenant_id, owner_id: viewer.id, text: body.trim() })
    if (error) { alert(`Could not save snippet: ${error.message}`); return }
    loadSnippets()
  }

  const deleteSnippet = async (id) => {
    const { error } = await supabase.from('feedback_snippets').delete().eq('id', id)
    if (!error) setSnippets((prev) => prev.filter((s) => s.id !== id))
  }

  const openRequired = rows.filter((r) => !r.parent_id && r.requires_response && !r.resolved_at)
  useEffect(() => {
    onOpenCountChange?.(openRequired.length)
  }, [rows]) // eslint-disable-line react-hooks/exhaustive-deps

  const topLevel = rows.filter((r) => !r.parent_id)
  const repliesOf = (id) => rows.filter((r) => r.parent_id === id)

  const postComment = async () => {
    if (!body.trim()) return
    setBusy(true)
    const { error } = await supabase.from('observation_threads').insert({
      tenant_id: viewer.tenant_id,
      observation_id: observationId,
      author_id: viewer.id,
      body: body.trim(),
      requires_response: isObserver ? requiresResponse : false,
    })
    if (error) { alert(`Could not post: ${error.message}`); setBusy(false); return }
    await markDeliveredIfNeeded()
    setBody(''); setRequiresResponse(false)
    await load()
    setBusy(false)
  }

  const postReply = async (parent) => {
    if (!replyBody.trim()) return
    setBusy(true)
    const { error } = await supabase.from('observation_threads').insert({
      tenant_id: viewer.tenant_id,
      observation_id: observationId,
      parent_id: parent.id,
      author_id: viewer.id,
      body: replyBody.trim(),
      requires_response: false,
    })
    if (error) { alert(`Could not reply: ${error.message}`); setBusy(false); return }

    // A staff reply to an open required-response comment resolves it.
    if (isStaff && parent.requires_response && !parent.resolved_at) {
      await supabase
        .from('observation_threads')
        .update({ resolved_at: new Date().toISOString(), resolved_by: viewer.id })
        .eq('id', parent.id)
    }
    setReplyTo(null); setReplyBody('')
    await load()
    setBusy(false)
  }

  const setResolved = async (item, resolved) => {
    setBusy(true)
    const { error } = await supabase
      .from('observation_threads')
      .update({
        resolved_at: resolved ? new Date().toISOString() : null,
        resolved_by: resolved ? viewer.id : null,
      })
      .eq('id', item.id)
    if (error) { alert(`Could not update: ${error.message}`) }
    await load()
    setBusy(false)
  }

  if (loading) {
    return <p className="text-sm text-[#666666]">Loading feedback…</p>
  }

  return (
    <div className="space-y-4">
      {openRequired.length > 0 && (
        <div className="text-xs px-3 py-2 rounded bg-amber-50 border border-amber-200 text-amber-800">
          {openRequired.length} comment{openRequired.length !== 1 ? 's' : ''} require{openRequired.length === 1 ? 's' : ''} a response.
          {isStaff ? ' Please reply to close them.' : ' Awaiting the staff member’s reply.'}
        </div>
      )}

      {topLevel.length === 0 && (
        <p className="text-sm text-[#666666] italic">No feedback comments yet.</p>
      )}

      {topLevel.map((c) => {
        const isOpenRequired = c.requires_response && !c.resolved_at
        return (
          <div key={c.id} className={`rounded-lg border p-3 ${isOpenRequired ? 'border-amber-300 bg-amber-50/40' : 'border-gray-200 bg-white'}`}>
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-sm font-medium text-[#2c3e7e]">{c.author?.full_name || 'User'}</span>
              <span className="text-[11px] text-[#666666]">{fmt(c.created_at)}</span>
            </div>
            {c.requires_response && (
              <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded mb-1 ${c.resolved_at ? 'bg-green-100 text-green-700' : 'bg-amber-200 text-amber-900'}`}>
                {c.resolved_at ? '✓ Response received' : '⚑ Requires response'}
              </span>
            )}
            <p className="text-sm text-[#333] whitespace-pre-wrap">{c.body}</p>

            {/* Replies */}
            <div className="mt-2 space-y-2 pl-3 border-l-2 border-gray-100">
              {repliesOf(c.id).map((r) => (
                <div key={r.id}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-[#2c3e7e]">{r.author?.full_name || 'User'}</span>
                    <span className="text-[10px] text-[#666666]">{fmt(r.created_at)}</span>
                  </div>
                  <p className="text-sm text-[#444] whitespace-pre-wrap">{r.body}</p>
                </div>
              ))}
            </div>

            {/* Actions */}
            {canPost && (
              <div className="mt-2 flex flex-wrap items-center gap-3">
                {replyTo === c.id ? (
                  <div className="w-full">
                    <textarea
                      value={replyBody}
                      onChange={(e) => setReplyBody(e.target.value)}
                      rows="2"
                      placeholder="Write a reply…"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1] resize-none"
                    />
                    <div className="flex gap-2 mt-1">
                      <button onClick={() => { setReplyTo(null); setReplyBody('') }} className="px-3 py-1 rounded-lg border border-gray-300 text-xs text-[#666666] hover:bg-gray-50">Cancel</button>
                      <button onClick={() => postReply(c)} disabled={busy || !replyBody.trim()} className="px-3 py-1 rounded-lg bg-[#2c3e7e] text-white text-xs hover:bg-[#1e2a5e] disabled:opacity-50">{busy ? 'Posting…' : 'Reply'}</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => { setReplyTo(c.id); setReplyBody('') }} className="text-xs text-[#477fc1] hover:underline">Reply</button>
                )}
                {isObserver && c.requires_response && (
                  c.resolved_at
                    ? <button onClick={() => setResolved(c, false)} disabled={busy} className="text-xs text-[#666666] hover:underline">Reopen</button>
                    : <button onClick={() => setResolved(c, true)} disabled={busy} className="text-xs text-green-700 hover:underline">Mark resolved</button>
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* New comment */}
      {canPost && (
        <div className="border-t border-gray-100 pt-3">
          {/* #12 reusable snippets (one-tap feedback) */}
          {isObserver && (
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              {snippets.map((s) => (
                <span key={s.id} className="inline-flex items-center rounded-full bg-gray-100 text-gray-700 text-xs overflow-hidden">
                  <button onClick={() => insertSnippet(s.text)} title="Insert snippet" className="px-2 py-1 hover:bg-gray-200">
                    {s.text.length > 32 ? s.text.slice(0, 32) + '…' : s.text}
                  </button>
                  <button onClick={() => deleteSnippet(s.id)} title="Delete snippet" className="px-1.5 py-1 text-gray-400 hover:text-red-600 hover:bg-gray-200">✕</button>
                </span>
              ))}
              <button
                onClick={saveSnippet}
                disabled={!body.trim()}
                title="Save the current text as a reusable snippet"
                className="text-xs px-2 py-1 rounded-full border border-dashed border-gray-300 text-[#477fc1] hover:bg-gray-50 disabled:opacity-40"
              >
                ＋ Save as snippet
              </button>
            </div>
          )}
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows="2"
            placeholder={isObserver ? 'Add a feedback comment…' : 'Add a comment…'}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1] resize-none"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 mt-1">
            {isObserver ? (
              <label className="flex items-center gap-1.5 text-xs text-[#666666] cursor-pointer">
                <input type="checkbox" checked={requiresResponse} onChange={(e) => setRequiresResponse(e.target.checked)} className="rounded text-[#477fc1]" />
                Requires a response from the staff member
              </label>
            ) : <span />}
            <button onClick={postComment} disabled={busy || !body.trim()} className="px-4 py-1.5 rounded-lg bg-[#2c3e7e] text-white text-sm hover:bg-[#1e2a5e] disabled:opacity-50">{busy ? 'Posting…' : 'Post comment'}</button>
          </div>
        </div>
      )}
    </div>
  )
}
