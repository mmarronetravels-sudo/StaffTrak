import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { obsTypeLabel } from '../lib/observationTypes'
import { openEvidenceFile } from '../lib/evidenceStorage'
import ObservationThread from '../components/ObservationThread'
import { feedbackTurnaround } from '../lib/feedbackTiming'

function ObservationSession() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const notesEndRef = useRef(null)

  const [observation, setObservation] = useState(null)
  const [notes, setNotes] = useState([])
  const [standards, setStandards] = useState([])
  const [domains, setDomains] = useState([])
  const [ratings, setRatings] = useState({}) // standard_id -> { id, rating }
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Note input state
  const [newNote, setNewNote] = useState('')
  const [noteType, setNoteType] = useState('general')
  const [selectedStandards, setSelectedStandards] = useState([])
  const [showStandardPicker, setShowStandardPicker] = useState(false)

  // Edit/delete state
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')
  const [editType, setEditType] = useState('general')

  // Completion state
  const [showCompleteModal, setShowCompleteModal] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [nextSteps, setNextSteps] = useState('')
  const [shareNotes, setShareNotes] = useState(true)

  // Timer state
  const [elapsedTime, setElapsedTime] = useState(0)
  const [isRunning, setIsRunning] = useState(false)

  useEffect(() => {
    fetchObservation()
  }, [id])

  useEffect(() => {
    // Timer logic
    let interval = null
    if (isRunning) {
      interval = setInterval(() => {
        setElapsedTime(prev => prev + 1)
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [isRunning])

  useEffect(() => {
    // Start timer if observation is in progress
    if (observation?.status === 'in_progress' && observation?.started_at) {
      const startTime = new Date(observation.started_at)
      const now = new Date()
      const elapsed = Math.floor((now - startTime) / 1000)
      setElapsedTime(elapsed)
      setIsRunning(true)
    }
  }, [observation])

  useEffect(() => {
    // Scroll to bottom when new notes are added
    notesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [notes])

  const fetchObservation = async () => {
    // Fetch observation details
    const { data: obsData, error: obsError } = await supabase
      .from('observations')
      .select(`
        *,
        staff:staff_id (id, full_name, position_type, staff_type)
      `)
      .eq('id', id)
      .single()

    if (obsError || !obsData) {
      console.error('Error fetching observation')
      navigate('/observations')
      return
    }

    // Verify the current user is the observer or the staff being observed
    if (obsData.observer_id !== profile.id && obsData.staff_id !== profile.id) {
      navigate('/observations')
      return
    }

    setObservation(obsData)
    setFeedback(obsData.feedback || '')
    setNextSteps(obsData.next_steps || '')
    setShareNotes(obsData.share_notes_with_staff !== false)

    // Fetch notes for this observation
    const { data: notesData } = await supabase
      .from('observation_notes')
      .select(`
        *,
        tags:observation_note_tags (
          id,
          standard:standard_id (id, code, name)
        )
      `)
      .eq('observation_id', id)
      .order('timestamp', { ascending: true })

    if (notesData) {
      setNotes(notesData)
    }

    // Fetch per-indicator ratings for this observation
    const { data: ratingData } = await supabase
      .from('observation_indicator_ratings')
      .select('id, standard_id, rating')
      .eq('observation_id', id)

    if (ratingData) {
      const map = {}
      ratingData.forEach((r) => { map[r.standard_id] = { id: r.id, rating: r.rating } })
      setRatings(map)
    }

    // Fetch rubric standards based on staff type
    await fetchRubricStandards(obsData.staff?.staff_type)

    setLoading(false)
  }

  const fetchRubricStandards = async (staffType) => {
    // Get the appropriate rubric based on staff type
    const rubricName = staffType === 'licensed'
      ? 'Teacher Rubric (NSQOT-Based)'
      : 'Non-Licensed 4-Domain Rubric'

    const { data: rubricData } = await supabase
      .from('rubrics')
      .select('id')
      .eq('name', rubricName)
      .single()

    if (rubricData) {
      // Fetch domains
      const { data: domainData } = await supabase
        .from('rubric_domains')
        .select('id, name, sort_order')
        .eq('rubric_id', rubricData.id)
        .order('sort_order', { ascending: true })

      if (domainData) {
        setDomains(domainData)

        // Fetch standards for all domains
        const domainIds = domainData.map(d => d.id)
        const { data: standardData } = await supabase
          .from('rubric_standards')
          .select('id, domain_id, code, name, sort_order')
          .in('domain_id', domainIds)
          .order('sort_order', { ascending: true })

        if (standardData) {
          setStandards(standardData)
        }
      }
    }
  }

  const addNote = async () => {
    if (!newNote.trim()) return

    setSaving(true)

    // Insert the note
    const { data: noteData, error: noteError } = await supabase
      .from('observation_notes')
      .insert([{
        observation_id: id,
        note_text: newNote.trim(),
        note_type: noteType,
        timestamp: new Date().toISOString()
      }])
      .select()

    if (noteError || !noteData) {
      console.error('Error adding note:', noteError)
      setSaving(false)
      return
    }

    const insertedNote = noteData[0]

    // Add standard tags if any selected
    if (selectedStandards.length > 0) {
      const tags = selectedStandards.map(standardId => ({
        note_id: insertedNote.id,
        standard_id: standardId
      }))

      const { error: tagError } = await supabase
        .from('observation_note_tags')
        .insert(tags)

      if (tagError) {
        console.error('Error adding tags:', tagError)
      }
    }

    // Fetch the note with tags
    const { data: fullNote } = await supabase
      .from('observation_notes')
      .select(`
        *,
        tags:observation_note_tags (
          id,
          standard:standard_id (id, code, name)
        )
      `)
      .eq('id', insertedNote.id)
      .single()

    if (fullNote) {
      setNotes([...notes, fullNote])
    }

    // Reset form
    setNewNote('')
    setSelectedStandards([])
    setNoteType('general')
    setSaving(false)
  }

  const startEdit = (note) => {
    setEditingId(note.id)
    setEditText(note.note_text)
    setEditType(note.note_type || 'general')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditText('')
  }

  const saveEdit = async (note) => {
    if (!editText.trim()) return
    setSaving(true)
    const { error } = await supabase
      .from('observation_notes')
      .update({ note_text: editText.trim(), note_type: editType })
      .eq('id', note.id)
    if (!error) {
      setNotes(notes.map(n => n.id === note.id ? { ...n, note_text: editText.trim(), note_type: editType } : n))
      setEditingId(null)
    } else {
      alert(`Could not save note: ${error.message}`)
    }
    setSaving(false)
  }

  const deleteNote = async (note) => {
    if (!window.confirm('Delete this note? This cannot be undone.')) return
    setSaving(true)
    // Remove tags first in case there's no cascade.
    await supabase.from('observation_note_tags').delete().eq('note_id', note.id)
    const { error } = await supabase.from('observation_notes').delete().eq('id', note.id)
    if (!error) {
      setNotes(notes.filter(n => n.id !== note.id))
    } else {
      alert(`Could not delete note: ${error.message}`)
    }
    setSaving(false)
  }

  const removeTag = async (note, tag) => {
    const { error } = await supabase.from('observation_note_tags').delete().eq('id', tag.id)
    if (!error) {
      setNotes(notes.map(n => n.id === note.id ? { ...n, tags: (n.tags || []).filter(t => t.id !== tag.id) } : n))
    } else {
      alert(`Could not remove tag: ${error.message}`)
    }
  }

  const toggleStandard = (standardId) => {
    if (selectedStandards.includes(standardId)) {
      setSelectedStandards(selectedStandards.filter(id => id !== standardId))
    } else {
      setSelectedStandards([...selectedStandards, standardId])
    }
  }

  const getStandardsForDomain = (domainId) => {
    return standards.filter(s => s.domain_id === domainId)
  }

  // How many notes in this observation are tagged to a given indicator (live coverage).
  const coverageFor = (standardId) =>
    notes.filter(n => n.tags?.some(t => t.standard?.id === standardId)).length

  // How many indicators in a domain have at least one tagged note.
  const domainCoverage = (domainId) => {
    const stds = getStandardsForDomain(domainId)
    const covered = stds.filter(s => coverageFor(s.id) > 0).length
    return { covered, total: stds.length }
  }

  // ── Per-indicator ratings (1-4, same scale as the summative) ──
  // Click the current rating again to clear it; otherwise upsert.
  const setRating = async (standardId, value) => {
    const existing = ratings[standardId]
    const clearing = existing?.rating === value

    if (clearing) {
      // optimistic clear
      setRatings(prev => {
        const next = { ...prev }
        delete next[standardId]
        return next
      })
      if (existing?.id) {
        const { error } = await supabase
          .from('observation_indicator_ratings')
          .delete()
          .eq('id', existing.id)
        if (error) {
          alert(`Could not clear rating: ${error.message}`)
          fetchObservation()
        }
      }
      return
    }

    // optimistic set
    setRatings(prev => ({ ...prev, [standardId]: { id: existing?.id, rating: value } }))
    const { data, error } = await supabase
      .from('observation_indicator_ratings')
      .upsert(
        { observation_id: id, standard_id: standardId, rating: value, rated_by: profile.id },
        { onConflict: 'observation_id,standard_id' }
      )
      .select('id, standard_id, rating')
      .single()
    if (error) {
      alert(`Could not save rating: ${error.message}`)
      fetchObservation()
    } else if (data) {
      setRatings(prev => ({ ...prev, [standardId]: { id: data.id, rating: data.rating } }))
    }
  }

  const ratedCount = (domainId) =>
    getStandardsForDomain(domainId).filter(s => ratings[s.id]?.rating).length

  const completeObservation = async () => {
    setSaving(true)

    const nowIso = new Date().toISOString()
    const { error } = await supabase
      .from('observations')
      .update({
        status: 'completed',
        ended_at: nowIso,
        feedback: feedback,
        next_steps: nextSteps,
        share_notes_with_staff: shareNotes,
        // #12: writing feedback at completion counts as "delivered" (don't overwrite an earlier delivery)
        ...(feedback.trim() && !observation?.feedback_delivered_at ? { feedback_delivered_at: nowIso } : {}),
      })
      .eq('id', id)

    if (!error) {
      setIsRunning(false)
      setShowCompleteModal(false)
      navigate('/observations')
    }

    setSaving(false)
  }

  const formatTime = (seconds) => {
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const formatNoteTime = (timestamp) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit'
    })
  }

  const getNoteTypeStyle = (type) => {
    switch (type) {
      case 'strength':
        return 'border-l-4 border-green-500 bg-green-50'
      case 'growth_area':
        return 'border-l-4 border-yellow-500 bg-yellow-50'
      case 'question':
        return 'border-l-4 border-purple-500 bg-purple-50'
      default:
        return 'border-l-4 border-gray-300 bg-white'
    }
  }

  const getNoteTypeIcon = (type) => {
    switch (type) {
      case 'strength':
        return '💪'
      case 'growth_area':
        return '🌱'
      case 'question':
        return '❓'
      default:
        return '📝'
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#2c3e7e] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-[#666666]">Loading observation...</p>
        </div>
      </div>
    )
  }

  const isViewOnly = observation?.status === 'completed'
  const canEdit = !isViewOnly && observation?.observer_id === profile.id
  const NOTE_TYPES = [
    ['general', '📝 General'],
    ['strength', '💪 Strength'],
    ['growth_area', '🌱 Growth'],
    ['question', '❓ Question'],
  ]

  // 1-4 rating scale — matches the summative (SummativeEvaluation.getOverallRating)
  const RATING_LEVELS = [
    { value: 1, short: 'NI', label: 'Needs Improvement', on: 'bg-red-600 text-white',    off: 'text-red-700 hover:bg-red-50' },
    { value: 2, short: 'D',  label: 'Developing',         on: 'bg-yellow-500 text-white', off: 'text-yellow-700 hover:bg-yellow-50' },
    { value: 3, short: 'E',  label: 'Effective',          on: 'bg-blue-600 text-white',   off: 'text-blue-700 hover:bg-blue-50' },
    { value: 4, short: 'HE', label: 'Highly Effective',   on: 'bg-green-600 text-white',  off: 'text-green-700 hover:bg-green-50' },
  ]

  // ── Reusable rubric panel (right side on desktop) ──
  const RubricPanel = () => (
    <div className="p-3 space-y-4">
      <p className="text-xs text-[#666666]">
        {isViewOnly ? 'Indicators evidenced and rated in this observation.' : 'Tap an indicator to attach it to your next note, and rate it 1–4.'}
      </p>
      {domains.length === 0 && (
        <p className="text-sm text-[#666666]">No rubric found for this staff member.</p>
      )}
      {domains.map(domain => {
        const { covered, total } = domainCoverage(domain.id)
        const rated = ratedCount(domain.id)
        return (
          <div key={domain.id}>
            <div className="flex items-center justify-between mb-1 gap-2">
              <p className="text-xs font-semibold text-[#2c3e7e]">{domain.name}</p>
              <div className="flex items-center gap-1 shrink-0">
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${covered > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`} title="Indicators with tagged notes">
                  🏷️ {covered}/{total}
                </span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${rated > 0 ? 'bg-[#2c3e7e] text-white' : 'bg-gray-100 text-gray-500'}`} title="Indicators rated">
                  ⭐ {rated}/{total}
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              {getStandardsForDomain(domain.id).map(std => {
                const count = coverageFor(std.id)
                const selected = selectedStandards.includes(std.id)
                const rating = ratings[std.id]?.rating
                return (
                  <div
                    key={std.id}
                    className={`rounded border ${
                      selected ? 'border-[#477fc1] bg-[#477fc1]/5'
                      : count > 0 || rating ? 'border-green-200 bg-green-50'
                      : 'border-gray-200 bg-white'
                    }`}
                  >
                    {/* Indicator label — tap to queue a tag for the next note */}
                    <button
                      onClick={() => !isViewOnly && toggleStandard(std.id)}
                      disabled={isViewOnly}
                      className={`w-full text-xs px-2 pt-2 pb-1.5 text-left transition-colors flex items-start gap-2 ${
                        selected ? 'text-[#2c3e7e]' : 'text-[#666666]'
                      } ${isViewOnly ? 'cursor-default' : 'hover:opacity-80'}`}
                    >
                      <span className="flex-1">
                        <span className="font-semibold">{std.code}</span> · {std.name}
                      </span>
                      {count > 0 && (
                        <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-green-600 text-white" title="Notes tagged here">
                          {count}
                        </span>
                      )}
                    </button>
                    {/* Rating row */}
                    <div className="flex items-center gap-1 px-2 pb-2">
                      <span className="text-[10px] text-gray-400 mr-0.5">Rate</span>
                      {RATING_LEVELS.map(lvl => {
                        const active = rating === lvl.value
                        if (isViewOnly && !active) return null
                        return (
                          <button
                            key={lvl.value}
                            onClick={() => !isViewOnly && setRating(std.id, lvl.value)}
                            disabled={isViewOnly}
                            title={lvl.label}
                            className={`text-[10px] font-semibold w-6 h-6 rounded flex items-center justify-center transition-colors ${
                              active ? lvl.on : `bg-white border border-gray-200 ${lvl.off}`
                            } ${isViewOnly ? 'cursor-default' : ''}`}
                          >
                            {lvl.value}
                          </button>
                        )
                      })}
                      {rating && (
                        <span className="text-[10px] text-[#666666] ml-1 truncate">
                          {RATING_LEVELS.find(l => l.value === rating)?.label}
                        </span>
                      )}
                      {isViewOnly && !rating && (
                        <span className="text-[10px] text-gray-400">Not rated</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )

  return (
    <div className="h-screen bg-gray-100 flex flex-col">
      {/* Top Header */}
      <header className="bg-[#2c3e7e] text-white p-4 shadow-lg z-20 shrink-0">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-semibold text-lg">
                {observation?.staff?.full_name}
              </h1>
              <span className={`text-xs px-2 py-1 rounded ${
                observation?.observation_type === 'formal' ? 'bg-white text-[#2c3e7e]' : 'bg-[#477fc1]'
              }`}>
                {obsTypeLabel(observation?.observation_type)}
              </span>
              {observation?.is_formative_only && (
                <span className="text-xs px-2 py-1 rounded bg-sky-200 text-sky-800" title="Formative only — not counted toward the summative score">
                  Formative
                </span>
              )}
            </div>
            <p className="text-sm text-gray-300">
              {observation?.staff?.position_type} • {observation?.subject_topic || 'Observation'}
            </p>
          </div>
          <div className="text-right">
            {!isViewOnly && (
              <div className="text-2xl font-mono font-bold">
                {formatTime(elapsedTime)}
              </div>
            )}
            <button
              onClick={() => navigate('/observations')}
              className="text-sm text-gray-300 hover:text-white"
            >
              ← Back to List
            </button>
          </div>
        </div>
      </header>

      {/* Body: notes column (left) + rubric panel (right, desktop) */}
      <div className="flex-1 flex min-h-0">
        {/* ── Notes column ── */}
        <div className="flex-1 flex flex-col min-w-0">
          <main className="flex-1 overflow-y-auto p-4">
            <div className="max-w-4xl mx-auto">
              {/* Pre-Observation Info (for formal observations) */}
              {observation?.observation_type === 'formal' && observation?.pre_observation_form && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="font-semibold text-[#2c3e7e]">📋 Pre-Observation Form</h3>
                    <button
                      onClick={() => document.getElementById('pre-obs-details').classList.toggle('hidden')}
                      className="text-sm text-[#477fc1] hover:underline"
                    >
                      Show/Hide Details
                    </button>
                  </div>
                  <div id="pre-obs-details" className="space-y-3 text-sm">
                    {observation.pre_observation_form.lesson_objective && (
                      <div>
                        <span className="font-medium text-[#2c3e7e]">Lesson Objective:</span>
                        <p className="text-[#666666]">{observation.pre_observation_form.lesson_objective}</p>
                      </div>
                    )}
                    {observation.pre_observation_form.standards_addressed && (
                      <div>
                        <span className="font-medium text-[#2c3e7e]">Standards:</span>
                        <p className="text-[#666666]">{observation.pre_observation_form.standards_addressed}</p>
                      </div>
                    )}
                    {observation.pre_observation_form.student_context && (
                      <div>
                        <span className="font-medium text-[#2c3e7e]">Student Context:</span>
                        <p className="text-[#666666]">{observation.pre_observation_form.student_context}</p>
                      </div>
                    )}
                    {observation.pre_observation_form.instructional_strategies && (
                      <div>
                        <span className="font-medium text-[#2c3e7e]">Instructional Strategies:</span>
                        <p className="text-[#666666]">{observation.pre_observation_form.instructional_strategies}</p>
                      </div>
                    )}
                    {observation.pre_observation_form.focus_areas && (
                      <div className="bg-yellow-50 border border-yellow-200 p-2 rounded">
                        <span className="font-medium text-[#f3843e]">🎯 Focus Areas Requested:</span>
                        <p className="text-[#666666]">{observation.pre_observation_form.focus_areas}</p>
                      </div>
                    )}
                    {observation.pre_observation_form.lesson_plan_path && (
                      <div>
                        <span className="font-medium text-[#2c3e7e]">Lesson Plan:</span>{' '}
                        <button
                          onClick={() => openEvidenceFile(observation.pre_observation_form.lesson_plan_path)}
                          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-[#477fc1] text-white hover:bg-[#3a6ca8]"
                        >
                          ⬇ {observation.pre_observation_form.lesson_plan_name || 'Download'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Notes List */}
              <div className="space-y-3">
                {notes.length === 0 ? (
                  <div className="text-center py-12 text-[#666666]">
                    <div className="text-5xl mb-4">📝</div>
                    <p>No notes yet. Start typing below!</p>
                  </div>
                ) : (
                  notes.map(note => {
                    const editing = editingId === note.id
                    return (
                    <div
                      key={note.id}
                      className={`p-4 rounded-lg shadow-sm ${getNoteTypeStyle(note.note_type)}`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-xs text-[#666666]">
                          {getNoteTypeIcon(note.note_type)} {formatNoteTime(note.timestamp)}
                        </span>
                        {canEdit && !editing && (
                          <div className="flex gap-3">
                            <button onClick={() => startEdit(note)} className="text-xs text-[#477fc1] hover:underline">Edit</button>
                            <button onClick={() => deleteNote(note)} className="text-xs text-red-600 hover:underline">Delete</button>
                          </div>
                        )}
                      </div>

                      {editing ? (
                        <div>
                          <div className="flex flex-wrap gap-2 mb-2">
                            {NOTE_TYPES.map(([val, label]) => (
                              <button
                                key={val}
                                onClick={() => setEditType(val)}
                                className={`px-2 py-1 rounded text-xs transition-colors ${
                                  editType === val ? 'bg-[#2c3e7e] text-white' : 'bg-gray-200 text-gray-700'
                                }`}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                          <textarea
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            rows="3"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1] resize-none"
                          />
                          <div className="flex gap-2 mt-2">
                            <button onClick={cancelEdit} className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-[#666666] hover:bg-gray-50">Cancel</button>
                            <button
                              onClick={() => saveEdit(note)}
                              disabled={saving || !editText.trim()}
                              className="px-3 py-1.5 rounded-lg bg-[#2c3e7e] text-white text-sm hover:bg-[#1e2a5e] disabled:opacity-50"
                            >
                              {saving ? 'Saving…' : 'Save'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-[#333] whitespace-pre-wrap">{note.note_text}</p>
                      )}

                      {note.tags && note.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {note.tags.map(tag => (
                            <span
                              key={tag.id}
                              className="text-xs bg-[#477fc1] text-white px-2 py-1 rounded flex items-center gap-1"
                              title={tag.standard?.name}
                            >
                              🏷️ {tag.standard?.code}
                              {canEdit && (
                                <button
                                  onClick={() => removeTag(note, tag)}
                                  className="hover:text-red-200"
                                  title="Remove tag"
                                >
                                  ✕
                                </button>
                              )}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    )
                  })
                )}
                <div ref={notesEndRef} />
              </div>

              {/* #4 Feedback & required-response loop (post-observation) */}
              {isViewOnly && (
                <div className="mt-6 bg-white rounded-lg shadow p-4">
                  <h3 className="font-semibold text-[#2c3e7e] mb-1">💬 Feedback &amp; Responses</h3>
                  <p className="text-xs text-[#666666] mb-3">
                    Post feedback comments and flag any that require a response from {observation?.staff?.full_name || 'the staff member'}.
                  </p>
                  <ObservationThread
                    observationId={id}
                    viewer={profile}
                    isObserver={observation?.observer_id === profile.id}
                    isStaff={observation?.staff_id === profile.id}
                    observationDelivered={!!observation?.feedback_delivered_at}
                    onDelivered={(ts) => setObservation((o) => ({ ...o, feedback_delivered_at: ts }))}
                  />
                </div>
              )}
            </div>
          </main>

          {/* Note Input - bottom of notes column */}
          {!isViewOnly && (
            <div className="bg-white border-t shadow-lg shrink-0">
              <div className="max-w-4xl mx-auto p-4">
                {/* Note Type Selector */}
                <div className="flex gap-2 mb-3">
                  <button
                    onClick={() => setNoteType('general')}
                    className={`px-3 py-1 rounded text-sm transition-colors ${
                      noteType === 'general' ? 'bg-gray-700 text-white' : 'bg-gray-200 text-gray-700'
                    }`}
                  >
                    📝 General
                  </button>
                  <button
                    onClick={() => setNoteType('strength')}
                    className={`px-3 py-1 rounded text-sm transition-colors ${
                      noteType === 'strength' ? 'bg-green-600 text-white' : 'bg-green-100 text-green-700'
                    }`}
                  >
                    💪 Strength
                  </button>
                  <button
                    onClick={() => setNoteType('growth_area')}
                    className={`px-3 py-1 rounded text-sm transition-colors ${
                      noteType === 'growth_area' ? 'bg-yellow-600 text-white' : 'bg-yellow-100 text-yellow-700'
                    }`}
                  >
                    🌱 Growth
                  </button>
                  <button
                    onClick={() => setNoteType('question')}
                    className={`px-3 py-1 rounded text-sm transition-colors ${
                      noteType === 'question' ? 'bg-purple-600 text-white' : 'bg-purple-100 text-purple-700'
                    }`}
                  >
                    ❓ Question
                  </button>
                </div>

                {/* Selected Standards (queued for the next note) */}
                {selectedStandards.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {selectedStandards.map(stdId => {
                      const std = standards.find(s => s.id === stdId)
                      return (
                        <span
                          key={stdId}
                          onClick={() => toggleStandard(stdId)}
                          className="text-xs bg-[#477fc1] text-white px-2 py-1 rounded cursor-pointer hover:bg-[#3a6ca8]"
                        >
                          {std?.code} ✕
                        </span>
                      )
                    })}
                  </div>
                )}

                {/* Input Row */}
                <div className="flex gap-2">
                  {/* Tag button — mobile only (desktop uses the side panel) */}
                  <button
                    onClick={() => setShowStandardPicker(!showStandardPicker)}
                    className={`lg:hidden px-3 py-2 rounded-lg border transition-colors ${
                      showStandardPicker ? 'bg-[#2c3e7e] text-white' : 'bg-gray-100 text-[#666666] hover:bg-gray-200'
                    }`}
                    title="Tag to Standard"
                  >
                    🏷️
                  </button>
                  <textarea
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="Type your observation note..."
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1] resize-none"
                    rows="2"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        addNote()
                      }
                    }}
                  />
                  <button
                    onClick={addNote}
                    disabled={saving || !newNote.trim()}
                    className="px-4 py-2 bg-[#2c3e7e] text-white rounded-lg hover:bg-[#1e2a5e] disabled:opacity-50"
                  >
                    {saving ? '...' : 'Add'}
                  </button>
                </div>

                {/* Standard Picker — mobile only */}
                {showStandardPicker && (
                  <div className="lg:hidden mt-3 max-h-48 overflow-y-auto border rounded-lg p-3 bg-gray-50">
                    <p className="text-xs text-[#666666] mb-2">Click to tag this note to a standard:</p>
                    {domains.map(domain => (
                      <div key={domain.id} className="mb-3">
                        <p className="text-xs font-semibold text-[#2c3e7e] mb-1">{domain.name}</p>
                        <div className="flex flex-col gap-1">
                          {getStandardsForDomain(domain.id).map(std => (
                            <button
                              key={std.id}
                              onClick={() => toggleStandard(std.id)}
                              className={`text-xs px-2 py-2 rounded transition-colors text-left ${
                                selectedStandards.includes(std.id)
                                  ? 'bg-[#477fc1] text-white'
                                  : 'bg-white border border-gray-300 text-[#666666] hover:bg-gray-100'
                              }`}
                            >
                              <span className="font-semibold">{std.code}</span> - {std.name}
                              {coverageFor(std.id) > 0 && <span className="ml-1 text-green-600">✓{coverageFor(std.id)}</span>}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Complete Button */}
                <div className="mt-3 flex justify-end">
                  <button
                    onClick={() => setShowCompleteModal(true)}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    ✓ Complete Observation
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* View Mode - Feedback Display */}
          {isViewOnly && observation && (
            <div className="bg-white border-t shadow-lg shrink-0">
              <div className="max-w-4xl mx-auto p-4">
                <div className="grid md:grid-cols-2 gap-4">
                  {observation.feedback && (
                    <div>
                      <h4 className="text-sm font-semibold text-[#2c3e7e] mb-1">Feedback</h4>
                      <p className="text-sm text-[#666666] bg-gray-50 p-3 rounded">{observation.feedback}</p>
                    </div>
                  )}
                  {observation.next_steps && (
                    <div>
                      <h4 className="text-sm font-semibold text-[#2c3e7e] mb-1">Next Steps</h4>
                      <p className="text-sm text-[#666666] bg-gray-50 p-3 rounded">{observation.next_steps}</p>
                    </div>
                  )}
                </div>
                <div className="mt-4 text-center">
                  <span className="text-sm text-green-600">✓ Observation completed</span>
                  {observation.ended_at && observation.started_at && (
                    <span className="text-sm text-[#666666] ml-2">
                      • Duration: {formatTime(
                        Math.floor((new Date(observation.ended_at) - new Date(observation.started_at)) / 1000)
                      )}
                    </span>
                  )}
                  {(() => {
                    const t = feedbackTurnaround(observation)
                    if (!t) return null
                    return (
                      <span className={`text-xs ml-2 px-2 py-0.5 rounded ${t.within24 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                        Feedback delivered in {t.label}{t.within24 ? ' ✓ (≤24h)' : ''}
                      </span>
                    )
                  })()}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Rubric panel (desktop only) ── */}
        <aside className="hidden lg:flex lg:flex-col w-80 border-l border-gray-200 bg-white shrink-0">
          <div className="p-4 border-b border-gray-100 shrink-0">
            <h3 className="font-semibold text-[#2c3e7e]">Rubric Coverage & Ratings</h3>
            <p className="text-xs text-[#666666]">Tag notes (🏷️) and rate indicators (⭐)</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            <RubricPanel />
          </div>
        </aside>
      </div>

      {/* Complete Observation Modal */}
      {showCompleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
            <div className="p-6">
              <h3 className="text-xl font-bold text-[#2c3e7e] mb-4">Complete Observation</h3>

              <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-[#666666]">
                  <strong>Staff:</strong> {observation?.staff?.full_name}
                </p>
                <p className="text-sm text-[#666666]">
                  <strong>Duration:</strong> {formatTime(elapsedTime)}
                </p>
                <p className="text-sm text-[#666666]">
                  <strong>Notes:</strong> {notes.length} notes recorded
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#666666] mb-1">
                    Feedback / Summary
                  </label>
                  <textarea
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                    rows="3"
                    placeholder="Overall feedback and observations..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#666666] mb-1">
                    Next Steps / Action Items
                  </label>
                  <textarea
                    value={nextSteps}
                    onChange={(e) => setNextSteps(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                    rows="2"
                    placeholder="Recommended next steps..."
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="shareNotes"
                    checked={shareNotes}
                    onChange={(e) => setShareNotes(e.target.checked)}
                    className="rounded text-[#477fc1]"
                  />
                  <label htmlFor="shareNotes" className="text-sm text-[#666666]">
                    Share notes with staff member
                  </label>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowCompleteModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-[#666666] hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={completeObservation}
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Complete Observation'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ObservationSession
