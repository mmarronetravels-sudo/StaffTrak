import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import Navbar from '../components/Navbar'

const HOURS_PER_DAY = 8
const HOURS_PER_WEEK = 40

function toHours(amount, unit) {
  const n = parseFloat(amount) || 0
  if (unit === 'hours') return n
  if (unit === 'days')  return n * HOURS_PER_DAY
  if (unit === 'weeks') return n * HOURS_PER_WEEK
  return n
}

function toUnit(hours, unit) {
  if (unit === 'hours') return hours
  if (unit === 'days')  return hours / HOURS_PER_DAY
  if (unit === 'weeks') return hours / HOURS_PER_WEEK
  return hours
}

function LeaveTracker() {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('dashboard')
  const [staff, setStaff] = useState([])
  const [leaveTypes, setLeaveTypes] = useState([])
  const [leavePolicies, setLeavePolicies] = useState([])
  const [leaveBalances, setLeaveBalances] = useState([])
  const [leaveEntries, setLeaveEntries] = useState([])
  const [qualifyingReasons, setQualifyingReasons] = useState([])
  const [qualifyingRelationships, setQualifyingRelationships] = useState([])
  const [selectedStaff, setSelectedStaff] = useState(null)
  const [showEntryModal, setShowEntryModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [schoolYear] = useState('2025-2026')
  const [notification, setNotification] = useState(null)

  // ── Edit state ──
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingEntry, setEditingEntry] = useState(null)
  const [editSaving, setEditSaving] = useState(false)
  const [editForm, setEditForm] = useState({
    leave_type_id: '', start_date: '', end_date: '',
    amount: '', tracking_unit: 'days',
    concurrent_leave_type_id: '', reason: '',
    documentation_on_file: false,
    qualifying_reason: '', qualifying_relationship: '', relationship_name: '',
  })

  const [newEntry, setNewEntry] = useState({
    staff_id: '', leave_type_id: '', start_date: '', end_date: '',
    amount: '', tracking_unit: 'days', concurrent_leave_type_id: '',
    reason: '', documentation_on_file: false,
    qualifying_reason: '', qualifying_relationship: '', relationship_name: '',
  })

  useEffect(() => {
    if (profile) fetchAllData()
  }, [profile])

  const showNotif = (msg, type = 'success') => {
    setNotification({ msg, type })
    setTimeout(() => setNotification(null), 3500)
  }

  const fetchAllData = async () => {
    setLoading(true)

    const { data: staffData } = await supabase
      .from('profiles').select('*')
      .eq('tenant_id', profile.tenant_id)
      .in('role', ['licensed_staff', 'classified_staff'])
      .order('full_name')

    const { data: typesData } = await supabase
      .from('leave_types').select('*')
      .eq('tenant_id', profile.tenant_id)
      .eq('is_active', true).order('sort_order')

    const { data: policiesData } = await supabase
      .from('leave_policies').select('*')
      .eq('tenant_id', profile.tenant_id).eq('school_year', schoolYear)

    const { data: balancesData } = await supabase
      .from('leave_balances').select('*')
      .eq('tenant_id', profile.tenant_id).eq('school_year', schoolYear)

    const { data: entriesData } = await supabase
      .from('leave_entries').select('*')
      .eq('tenant_id', profile.tenant_id).eq('school_year', schoolYear)
      .order('start_date', { ascending: false })

    const { data: qr } = await supabase
      .from('leave_qualifying_reasons').select('*').order('sort_order')

    const { data: qrel } = await supabase
      .from('leave_qualifying_relationships').select('*').order('sort_order')

    if (staffData) setStaff(staffData)
    if (typesData) setLeaveTypes(typesData)
    if (policiesData) setLeavePolicies(policiesData)
    if (balancesData) setLeaveBalances(balancesData)
    if (entriesData) setLeaveEntries(entriesData)
    if (qr) setQualifyingReasons(qr)
    if (qrel) setQualifyingRelationships(qrel)

    setLoading(false)
  }

  const initializeBalances = async (staffId) => {
    const existingBalances = leaveBalances.filter(b => b.staff_id === staffId)
    if (existingBalances.length > 0) return

    const newBalances = leaveTypes.map(lt => {
      const policy = leavePolicies.find(p => p.leave_type_id === lt.id)
      return {
        tenant_id: profile.tenant_id, staff_id: staffId, leave_type_id: lt.id,
        school_year: schoolYear,
        allocated: policy?.days_per_year || policy?.weeks_per_year || 0,
        used: 0, carried_over: 0,
        tracking_unit: policy?.tracking_unit || 'days'
      }
    })

    const { data, error } = await supabase.from('leave_balances').insert(newBalances).select()
    if (!error && data) setLeaveBalances(prev => [...prev, ...data])
  }

  // ── Qualifying field derived state (new entry modal) ──
  const selectedLeaveType = leaveTypes.find(t => t.id === newEntry.leave_type_id)
  const isProtectedLeave = selectedLeaveType && selectedLeaveType.category !== 'school_provided'
  const leaveTypeCode = selectedLeaveType?.code || ''
  const filteredReasons = qualifyingReasons.filter(r => r.leave_type_code === leaveTypeCode)
  const filteredRelationships = qualifyingRelationships.filter(r => r.leave_type_code === leaveTypeCode)
  const isSelfRelationship = newEntry.qualifying_relationship === 'self'

  // ── Qualifying field derived state (edit modal) ──
  const editLeaveType = leaveTypes.find(t => t.id === editForm.leave_type_id)
  const editIsProtected = editLeaveType && editLeaveType.category !== 'school_provided'
  const editLeaveTypeCode = editLeaveType?.code || ''
  const editFilteredReasons = qualifyingReasons.filter(r => r.leave_type_code === editLeaveTypeCode)
  const editFilteredRelationships = qualifyingRelationships.filter(r => r.leave_type_code === editLeaveTypeCode)
  const editIsSelf = editForm.qualifying_relationship === 'self'

  // ── Save new entry ──
  const handleSaveEntry = async () => {
    if (!newEntry.staff_id || !newEntry.leave_type_id || !newEntry.start_date || !newEntry.end_date || !newEntry.amount) {
      alert('Please fill in all required fields.')
      return
    }

    const entryData = {
      tenant_id: profile.tenant_id, staff_id: newEntry.staff_id,
      leave_type_id: newEntry.leave_type_id, school_year: schoolYear,
      start_date: newEntry.start_date, end_date: newEntry.end_date,
      amount: parseFloat(newEntry.amount), tracking_unit: newEntry.tracking_unit,
      concurrent_leave_type_id: newEntry.concurrent_leave_type_id || null,
      reason: newEntry.reason || null,
      documentation_on_file: newEntry.documentation_on_file,
      entered_by: profile.id,
      qualifying_reason: isProtectedLeave && newEntry.qualifying_reason ? newEntry.qualifying_reason : null,
      qualifying_relationship: isProtectedLeave && newEntry.qualifying_relationship ? newEntry.qualifying_relationship : null,
      relationship_name: isProtectedLeave && !isSelfRelationship && newEntry.relationship_name ? newEntry.relationship_name : null,
    }

    const { data, error } = await supabase.from('leave_entries').insert([entryData]).select()
    if (error) { alert('Error saving entry: ' + error.message); return }

    // Update balance (with unit conversion)
    const balance = leaveBalances.find(
      b => b.staff_id === newEntry.staff_id && b.leave_type_id === newEntry.leave_type_id && b.school_year === schoolYear
    )
    if (balance) {
      const balUnit = balance.tracking_unit || newEntry.tracking_unit
      const addAmt  = toUnit(toHours(newEntry.amount, newEntry.tracking_unit), balUnit)
      const newUsed = +(parseFloat(balance.used) + addAmt).toFixed(2)
      const { data: updBal } = await supabase.from('leave_balances').update({ used: newUsed }).eq('id', balance.id).select()
      if (updBal) setLeaveBalances(prev => prev.map(b => b.id === balance.id ? updBal[0] : b))
    }

    setLeaveEntries(prev => [data[0], ...prev])
    setShowEntryModal(false)
    setNewEntry({
      staff_id: '', leave_type_id: '', start_date: '', end_date: '',
      amount: '', tracking_unit: 'days', concurrent_leave_type_id: '',
      reason: '', documentation_on_file: false,
      qualifying_reason: '', qualifying_relationship: '', relationship_name: '',
    })
  }

  // ── Delete entry (with balance reversal + unit conversion fix) ──
  const handleDeleteEntry = async (entry) => {
    if (!confirm('Are you sure you want to delete this leave entry?')) return

    const { error } = await supabase.from('leave_entries').delete().eq('id', entry.id)
    if (error) { alert('Error deleting: ' + error.message); return }

    // Reverse balance
    const balance = leaveBalances.find(
      b => b.staff_id === entry.staff_id && b.leave_type_id === entry.leave_type_id && b.school_year === schoolYear
    )
    if (balance) {
      const balUnit  = balance.tracking_unit || entry.tracking_unit
      const reverseAmt = toUnit(toHours(entry.amount, entry.tracking_unit), balUnit)
      const newUsed  = +Math.max(0, parseFloat(balance.used) - reverseAmt).toFixed(2)
      const { data: updBal } = await supabase.from('leave_balances').update({ used: newUsed }).eq('id', balance.id).select()
      if (updBal) setLeaveBalances(prev => prev.map(b => b.id === balance.id ? updBal[0] : b))
    }

    setLeaveEntries(prev => prev.filter(e => e.id !== entry.id))
    // If detail modal is open for this staff, it will re-derive from updated leaveEntries automatically
  }

  // ── Open edit modal ──
  const openEdit = (entry) => {
    setEditingEntry(entry)
    setEditForm({
      leave_type_id:            entry.leave_type_id || '',
      start_date:               entry.start_date || '',
      end_date:                 entry.end_date || '',
      amount:                   entry.amount?.toString() || '',
      tracking_unit:            entry.tracking_unit || 'days',
      concurrent_leave_type_id: entry.concurrent_leave_type_id || '',
      reason:                   entry.reason || '',
      documentation_on_file:    entry.documentation_on_file || false,
      qualifying_reason:        entry.qualifying_reason || '',
      qualifying_relationship:  entry.qualifying_relationship || '',
      relationship_name:        entry.relationship_name || '',
    })
    setShowEditModal(true)
  }

  // ── Save edit (record only — balances not auto-adjusted) ──
  const handleSaveEdit = async () => {
    if (!editForm.leave_type_id || !editForm.start_date || !editForm.end_date || !editForm.amount) {
      showNotif('Leave type, dates, and amount are required.', 'error')
      return
    }
    setEditSaving(true)

    const { data, error } = await supabase
      .from('leave_entries')
      .update({
        leave_type_id:            editForm.leave_type_id,
        start_date:               editForm.start_date,
        end_date:                 editForm.end_date,
        amount:                   parseFloat(editForm.amount),
        tracking_unit:            editForm.tracking_unit,
        concurrent_leave_type_id: editForm.concurrent_leave_type_id || null,
        reason:                   editForm.reason || null,
        documentation_on_file:    editForm.documentation_on_file,
        qualifying_reason:        editIsProtected && editForm.qualifying_reason ? editForm.qualifying_reason : null,
        qualifying_relationship:  editIsProtected && editForm.qualifying_relationship ? editForm.qualifying_relationship : null,
        relationship_name:        editIsProtected && !editIsSelf && editForm.relationship_name ? editForm.relationship_name : null,
      })
      .eq('id', editingEntry.id)
      .select()

    setEditSaving(false)

    if (error) { showNotif('Error saving: ' + error.message, 'error'); return }

    setLeaveEntries(prev => prev.map(e => e.id === data[0].id ? data[0] : e))
    setShowEditModal(false)
    setEditingEntry(null)
    showNotif('Entry updated. If the amount changed, adjust the balance in the staff detail view.')
  }

  // ── Other handlers ──
  const handleViewStaff = async (staffMember) => {
    setSelectedStaff(staffMember)
    await initializeBalances(staffMember.id)
    setShowDetailModal(true)
  }

  const handleAddEntryForStaff = (staffMember) => {
    setNewEntry(prev => ({ ...prev, staff_id: staffMember.id }))
    setShowEntryModal(true)
  }

  // ── Helpers ──
  const getTypeName     = (id) => leaveTypes.find(t => t.id === id)?.name || 'Unknown'
  const getTypeCategory = (id) => leaveTypes.find(t => t.id === id)?.category || ''
  const getStaffName    = (id) => staff.find(s => s.id === id)?.full_name || 'Unknown'

  const getStaffBalances = (staffId) => leaveTypes.map(lt => {
    const balance = leaveBalances.find(b => b.staff_id === staffId && b.leave_type_id === lt.id)
    const policy  = leavePolicies.find(p => p.leave_type_id === lt.id)
    return { type: lt, policy, balance: balance || { allocated: policy?.days_per_year || policy?.weeks_per_year || 0, used: 0, carried_over: 0 } }
  })

  const getStaffEntries = (staffId) => leaveEntries.filter(e => e.staff_id === staffId)

  const getCategoryColor = (cat) => {
    switch (cat) {
      case 'school_provided': return 'bg-blue-100 text-blue-800'
      case 'state':           return 'bg-green-100 text-green-800'
      case 'federal':         return 'bg-purple-100 text-purple-800'
      default:                return 'bg-gray-100 text-gray-800'
    }
  }

  const getUsagePercent = (used, allocated) => {
    if (!allocated || allocated === 0) return 0
    return Math.min(100, Math.round((used / allocated) * 100))
  }

  const getBarColor = (pct) => {
    if (pct >= 90) return 'bg-red-500'
    if (pct >= 75) return 'bg-[#f3843e]'
    if (pct >= 50) return 'bg-yellow-400'
    return 'bg-green-500'
  }

  const filteredStaff = staff.filter(s =>
    s.full_name?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const totalStaff            = staff.length
  const staffWithLeave        = [...new Set(leaveEntries.map(e => e.staff_id))].length
  const totalEntriesThisYear  = leaveEntries.length
  const staffApproachingLimits = staff.filter(s =>
    getStaffBalances(s.id).some(b => {
      const allocated = parseFloat(b.balance.allocated) + parseFloat(b.balance.carried_over || 0)
      const used      = parseFloat(b.balance.used)
      return allocated > 0 && (used / allocated) >= 0.75
    })
  ).length

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100">
        <Navbar />
        <div className="flex items-center justify-center h-64">
          <p className="text-[#666666]">Loading leave data...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <Navbar />

      {/* Toast */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium max-w-sm ${
          notification.type === 'error' ? 'bg-red-600' : 'bg-green-600'
        }`}>
          {notification.msg}
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <div>
            <h2 className="text-2xl font-bold text-[#2c3e7e]">Leave Tracker</h2>
            <p className="text-[#666666] text-sm mt-1">School Year: {schoolYear}</p>
          </div>
          <button onClick={() => setShowEntryModal(true)}
            className="bg-[#2c3e7e] text-white px-4 py-2 rounded-lg hover:bg-[#477fc1] transition-colors">
            + Log Leave Entry
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg shadow border-l-4 border-[#2c3e7e]">
            <p className="text-[#666666] text-sm">Total Staff</p>
            <p className="text-2xl font-bold text-[#2c3e7e]">{totalStaff}</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border-l-4 border-[#477fc1]">
            <p className="text-[#666666] text-sm">Staff With Leave Used</p>
            <p className="text-2xl font-bold text-[#477fc1]">{staffWithLeave}</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border-l-4 border-green-500">
            <p className="text-[#666666] text-sm">Total Entries This Year</p>
            <p className="text-2xl font-bold text-green-600">{totalEntriesThisYear}</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border-l-4 border-[#f3843e]">
            <p className="text-[#666666] text-sm">Approaching Limits</p>
            <p className="text-2xl font-bold text-[#f3843e]">{staffApproachingLimits}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-gray-200">
          {[
            { id: 'dashboard',  label: 'Staff Overview' },
            { id: 'entries',    label: 'All Entries' },
            { id: 'compliance', label: 'Compliance Notes' },
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-[#2c3e7e] text-[#2c3e7e]'
                  : 'border-transparent text-[#666666] hover:text-[#2c3e7e]'
              }`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Tab: Staff Overview ── */}
        {activeTab === 'dashboard' && (
          <div>
            <div className="mb-4">
              <input type="text" placeholder="Search staff..."
                value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                className="w-full sm:w-64 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredStaff.map(s => {
                const balances       = getStaffBalances(s.id)
                const schoolProvided = balances.filter(b => b.type.category === 'school_provided')
                const stateFederal   = balances.filter(b => b.type.category !== 'school_provided')
                const entries        = getStaffEntries(s.id)

                return (
                  <div key={s.id} className="bg-white rounded-lg shadow p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="font-semibold text-[#2c3e7e]">{s.full_name}</h3>
                        <p className="text-sm text-[#666666]">{s.position_type || s.role}</p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleAddEntryForStaff(s)}
                          className="text-xs bg-[#2c3e7e] text-white px-3 py-1 rounded hover:bg-[#477fc1] transition-colors">
                          + Log Leave
                        </button>
                        <button onClick={() => handleViewStaff(s)}
                          className="text-xs bg-gray-100 text-[#2c3e7e] px-3 py-1 rounded hover:bg-gray-200 transition-colors">
                          View Details
                        </button>
                      </div>
                    </div>

                    {schoolProvided.length > 0 && (
                      <div className="mb-3">
                        <p className="text-xs font-medium text-[#666666] mb-2">School-Provided Leave</p>
                        <div className="space-y-2">
                          {schoolProvided.map(b => {
                            const allocated = parseFloat(b.balance.allocated) + parseFloat(b.balance.carried_over || 0)
                            const used      = parseFloat(b.balance.used)
                            const percent   = getUsagePercent(used, allocated)
                            const isWeeks   = b.policy?.tracking_unit === 'weeks'
                            return (
                              <div key={b.type.id}>
                                <div className="flex justify-between text-xs mb-1">
                                  <span className="text-[#2c3e7e] font-medium">{b.type.name}</span>
                                  <span className="text-[#666666]">{used}/{allocated} {isWeeks ? 'wks' : 'days'}</span>
                                </div>
                                {allocated > 0 && (
                                  <div className="w-full bg-gray-200 rounded-full h-1.5">
                                    <div className={`h-1.5 rounded-full ${getBarColor(percent)}`} style={{ width: `${percent}%` }} />
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {stateFederal.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-[#666666] mb-2">Protected Leave (Federal/State)</p>
                        <div className="flex flex-wrap gap-2">
                          {stateFederal.map(b => {
                            const totalUsed = getStaffEntries(s.id)
                              .filter(e => e.leave_type_id === b.type.id)
                              .reduce((sum, e) => sum + parseFloat(e.amount || 0), 0)
                            return (
                              <div key={b.type.id} className="text-xs bg-gray-50 rounded px-2 py-1">
                                <span className={`inline-block w-2 h-2 rounded-full mr-1 ${b.type.category === 'federal' ? 'bg-purple-400' : 'bg-green-400'}`} />
                                {b.type.name}: {totalUsed} used
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {entries.length > 0 && (
                      <p className="text-xs text-[#666666] mt-2">
                        {entries.length} leave {entries.length === 1 ? 'entry' : 'entries'} this year
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Tab: All Entries ── */}
        {activeTab === 'entries' && (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-[#2c3e7e]">Staff Member</th>
                    <th className="text-left px-4 py-3 font-semibold text-[#2c3e7e]">Leave Type</th>
                    <th className="text-left px-4 py-3 font-semibold text-[#2c3e7e]">Dates</th>
                    <th className="text-left px-4 py-3 font-semibold text-[#2c3e7e]">Amount</th>
                    <th className="text-left px-4 py-3 font-semibold text-[#2c3e7e]">Qualifying Info</th>
                    <th className="text-left px-4 py-3 font-semibold text-[#2c3e7e]">Notes</th>
                    <th className="text-left px-4 py-3 font-semibold text-[#2c3e7e]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {leaveEntries.map(entry => (
                    <tr key={entry.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-[#2c3e7e]">{getStaffName(entry.staff_id)}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${getCategoryColor(getTypeCategory(entry.leave_type_id))}`}>
                          {getTypeName(entry.leave_type_id)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[#666666] whitespace-nowrap">
                        {new Date(entry.start_date).toLocaleDateString()} – {new Date(entry.end_date).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-[#2c3e7e] font-medium whitespace-nowrap">
                        {entry.amount} {entry.tracking_unit}
                      </td>
                      <td className="px-4 py-3 text-xs text-[#666666]">
                        {entry.qualifying_reason && (
                          <div>{entry.qualifying_reason.replace(/_/g, ' ')}</div>
                        )}
                        {entry.qualifying_relationship && (
                          <div className="text-gray-400">
                            {entry.qualifying_relationship.replace(/_/g, ' ')}
                            {entry.relationship_name ? ` — ${entry.relationship_name}` : ''}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[#666666] text-xs">{entry.reason}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <button onClick={() => openEdit(entry)}
                          className="text-[#477fc1] hover:text-[#2c3e7e] text-xs font-medium mr-3 transition-colors">
                          Edit
                        </button>
                        <button onClick={() => handleDeleteEntry(entry)}
                          className="text-red-400 hover:text-red-600 text-xs">
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {leaveEntries.length === 0 && (
                <div className="text-center py-12 text-[#666666]">
                  No leave entries recorded yet. Click "Log Leave Entry" to add one.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Tab: Compliance Notes ── */}
        {activeTab === 'compliance' && (
          <div className="space-y-4">
            {leaveTypes.map(lt => {
              const policy = leavePolicies.find(p => p.leave_type_id === lt.id)
              if (!policy && !lt.description) return null
              return (
                <div key={lt.id} className="bg-white rounded-lg shadow p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-semibold text-[#2c3e7e]">{lt.name}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${getCategoryColor(lt.category)}`}>
                      {lt.category === 'school_provided' ? 'School' : lt.category === 'state' ? 'Oregon State' : 'Federal'}
                    </span>
                  </div>
                  {lt.description && <p className="text-sm text-[#666666] mb-2">{lt.description}</p>}
                  {policy?.eligibility_notes && (
                    <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-2">
                      <p className="text-xs font-medium text-blue-800 mb-1">Eligibility:</p>
                      <p className="text-xs text-blue-700">{policy.eligibility_notes}</p>
                    </div>
                  )}
                  {policy?.compliance_notes && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mb-2">
                      <p className="text-xs font-medium text-yellow-800 mb-1">Compliance Notes:</p>
                      <p className="text-xs text-yellow-700">{policy.compliance_notes}</p>
                    </div>
                  )}
                  {policy?.concurrent_with?.length > 0 && (
                    <div className="bg-purple-50 border border-purple-200 rounded p-3">
                      <p className="text-xs font-medium text-purple-800 mb-1">Can Run Concurrently With:</p>
                      <p className="text-xs text-purple-700">{policy.concurrent_with.join(', ')}</p>
                    </div>
                  )}
                  {policy && (
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-[#666666]">
                      {policy.days_per_year && <span>Allocation: {policy.days_per_year} days/year</span>}
                      {policy.weeks_per_year && <span>Allocation: {policy.weeks_per_year} weeks/year</span>}
                      {policy.carryover_max !== null && policy.carryover_max !== undefined && (
                        <span>Carryover: {policy.carryover_max === 0 ? 'None' : `Up to ${policy.carryover_max} days`}</span>
                      )}
                      {policy.transfer_max && <span>Transfer: Up to {policy.transfer_max} days between districts</span>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* ══════════════════════════════════════════════════════
          Modal: Log Leave Entry
      ══════════════════════════════════════════════════════ */}
      {showEntryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-[#2c3e7e]">Log Leave Entry</h3>
                <button onClick={() => setShowEntryModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#666666] mb-1">Staff Member *</label>
                  <select value={newEntry.staff_id}
                    onChange={e => setNewEntry(prev => ({ ...prev, staff_id: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]">
                    <option value="">Select staff member...</option>
                    {staff.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#666666] mb-1">Leave Type *</label>
                  <select value={newEntry.leave_type_id}
                    onChange={e => {
                      const policy = leavePolicies.find(p => p.leave_type_id === e.target.value)
                      setNewEntry(prev => ({
                        ...prev, leave_type_id: e.target.value,
                        tracking_unit: policy?.tracking_unit || 'days',
                        qualifying_reason: '', qualifying_relationship: '', relationship_name: '',
                      }))
                    }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]">
                    <option value="">Select leave type...</option>
                    <optgroup label="School-Provided">
                      {leaveTypes.filter(t => t.category === 'school_provided').map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </optgroup>
                    <optgroup label="Federal">
                      {leaveTypes.filter(t => t.category === 'federal').map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </optgroup>
                    <optgroup label="Oregon State">
                      {leaveTypes.filter(t => t.category === 'state').map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </optgroup>
                  </select>
                </div>

                {isProtectedLeave && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-blue-700 text-sm font-bold">Qualifying Information</span>
                      <span className="text-xs text-blue-500 font-medium px-2 py-0.5 bg-blue-100 rounded-full">{selectedLeaveType?.name}</span>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-blue-800 mb-1">Qualifying Reason</label>
                      <select value={newEntry.qualifying_reason}
                        onChange={e => setNewEntry(p => ({ ...p, qualifying_reason: e.target.value }))}
                        className="w-full border border-blue-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                        <option value="">Select reason...</option>
                        {filteredReasons.map(r => <option key={r.id} value={r.qualifying_reason}>{r.display_name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-blue-800 mb-1">Relationship to Employee</label>
                      <select value={newEntry.qualifying_relationship}
                        onChange={e => setNewEntry(p => ({
                          ...p, qualifying_relationship: e.target.value,
                          relationship_name: e.target.value === 'self' ? '' : p.relationship_name,
                        }))}
                        className="w-full border border-blue-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                        <option value="">Select relationship...</option>
                        {filteredRelationships.map(r => <option key={r.id} value={r.qualifying_relationship}>{r.display_name}</option>)}
                      </select>
                    </div>
                    {newEntry.qualifying_relationship && !isSelfRelationship && (
                      <div>
                        <label className="block text-sm font-semibold text-blue-800 mb-1">
                          Family Member Name <span className="font-normal text-blue-500">(optional)</span>
                        </label>
                        <input type="text" value={newEntry.relationship_name}
                          onChange={e => setNewEntry(p => ({ ...p, relationship_name: e.target.value }))}
                          placeholder="e.g. Jane Smith"
                          className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400" />
                      </div>
                    )}
                    {newEntry.qualifying_relationship === 'affinity' && (
                      <p className="text-xs text-blue-600 bg-blue-100 rounded p-2">
                        Oregon law recognizes persons related by affinity — individuals with an equivalent family relationship who may not have legal ties. Employee attestation is sufficient documentation.
                      </p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-[#666666] mb-1">Start Date *</label>
                    <input type="date" value={newEntry.start_date}
                      onChange={e => setNewEntry(prev => ({ ...prev, start_date: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#666666] mb-1">End Date *</label>
                    <input type="date" value={newEntry.end_date}
                      onChange={e => setNewEntry(prev => ({ ...prev, end_date: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#666666] mb-1">Amount ({newEntry.tracking_unit}) *</label>
                  <input type="number" step="0.5" min="0" value={newEntry.amount}
                    onChange={e => setNewEntry(prev => ({ ...prev, amount: e.target.value }))}
                    placeholder={`Number of ${newEntry.tracking_unit}`}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#666666] mb-1">Running Concurrently With (optional)</label>
                  <select value={newEntry.concurrent_leave_type_id}
                    onChange={e => setNewEntry(prev => ({ ...prev, concurrent_leave_type_id: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]">
                    <option value="">None</option>
                    {leaveTypes.filter(t => t.id !== newEntry.leave_type_id).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#666666] mb-1">Notes / Reason (optional)</label>
                  <textarea value={newEntry.reason}
                    onChange={e => setNewEntry(prev => ({ ...prev, reason: e.target.value }))}
                    rows={2} placeholder="Optional notes..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]" />
                </div>

                <div className="flex items-center gap-2">
                  <input type="checkbox" id="docs" checked={newEntry.documentation_on_file}
                    onChange={e => setNewEntry(prev => ({ ...prev, documentation_on_file: e.target.checked }))}
                    className="rounded border-gray-300" />
                  <label htmlFor="docs" className="text-sm text-[#666666]">Documentation on file</label>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setShowEntryModal(false)}
                  className="px-4 py-2 text-sm text-[#666666] border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                <button onClick={handleSaveEntry}
                  className="px-4 py-2 text-sm bg-[#2c3e7e] text-white rounded-lg hover:bg-[#477fc1] transition-colors">Save Entry</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          Modal: Staff Detail
      ══════════════════════════════════════════════════════ */}
      {showDetailModal && selectedStaff && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="text-lg font-bold text-[#2c3e7e]">{selectedStaff.full_name}</h3>
                  <p className="text-sm text-[#666666]">{selectedStaff.position_type || selectedStaff.role} – {schoolYear}</p>
                </div>
                <button onClick={() => setShowDetailModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
              </div>

              <h4 className="font-semibold text-[#2c3e7e] mb-3">Leave Balances</h4>
              <div className="space-y-3 mb-6">
                {getStaffBalances(selectedStaff.id).map(b => {
                  const allocated = parseFloat(b.balance.allocated) + parseFloat(b.balance.carried_over || 0)
                  const used      = parseFloat(b.balance.used)
                  const remaining = Math.round((Math.max(0, allocated - used)) * 10) / 10
                  const percent   = getUsagePercent(used, allocated)
                  const isWeeks   = b.policy?.tracking_unit === 'weeks'
                  return (
                    <div key={b.type.id} className="bg-gray-50 rounded-lg p-3">
                      <div className="flex justify-between items-center mb-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-[#2c3e7e]">{b.type.name}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${getCategoryColor(b.type.category)}`}>
                            {b.type.category === 'school_provided' ? 'School' : b.type.category === 'state' ? 'State' : 'Federal'}
                          </span>
                        </div>
                        <span className="text-sm font-medium text-[#2c3e7e]">{used} / {allocated} {isWeeks ? 'weeks' : 'days'} used</span>
                      </div>
                      {allocated > 0 && (
                        <div className="w-full bg-gray-200 rounded-full h-2.5 mt-1">
                          <div className={`h-2.5 rounded-full transition-all ${getBarColor(percent)}`} style={{ width: `${percent}%` }} />
                        </div>
                      )}
                      <div className="flex justify-between text-xs text-[#666666] mt-1">
                        <span>{remaining} {isWeeks ? 'weeks' : 'days'} remaining</span>
                        {parseFloat(b.balance.carried_over) > 0 && <span>(includes {b.balance.carried_over} carried over)</span>}
                      </div>
                    </div>
                  )
                })}
              </div>

              <h4 className="font-semibold text-[#2c3e7e] mb-3">Leave History</h4>
              {getStaffEntries(selectedStaff.id).length === 0 ? (
                <p className="text-sm text-[#666666]">No leave entries recorded.</p>
              ) : (
                <div className="space-y-2">
                  {getStaffEntries(selectedStaff.id).map(entry => (
                    <div key={entry.id} className="flex justify-between items-start bg-gray-50 rounded-lg p-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${getCategoryColor(getTypeCategory(entry.leave_type_id))}`}>
                            {getTypeName(entry.leave_type_id)}
                          </span>
                          <span className="text-sm text-[#666666]">
                            {new Date(entry.start_date).toLocaleDateString()} – {new Date(entry.end_date).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-sm text-[#2c3e7e] font-medium mt-1">
                          {entry.amount} {entry.tracking_unit}
                          {entry.concurrent_leave_type_id && (
                            <span className="text-xs text-yellow-700 ml-2">(concurrent with {getTypeName(entry.concurrent_leave_type_id)})</span>
                          )}
                        </p>
                        {(entry.qualifying_reason || entry.qualifying_relationship) && (
                          <p className="text-xs text-blue-600 mt-0.5">
                            {entry.qualifying_reason?.replace(/_/g, ' ')}
                            {entry.qualifying_relationship && ` · ${entry.qualifying_relationship.replace(/_/g, ' ')}`}
                            {entry.relationship_name && ` (${entry.relationship_name})`}
                          </p>
                        )}
                        {entry.reason && <p className="text-xs text-[#666666] mt-1">{entry.reason}</p>}
                      </div>
                      <div className="flex items-center gap-2 ml-3 shrink-0">
                        {entry.documentation_on_file && <span className="text-green-600 text-xs">Docs ✓</span>}
                        <button onClick={() => { setShowDetailModal(false); openEdit(entry) }}
                          className="text-[#477fc1] hover:text-[#2c3e7e] text-xs font-medium transition-colors">
                          Edit
                        </button>
                        <button onClick={() => handleDeleteEntry(entry)}
                          className="text-red-400 hover:text-red-600 text-xs">
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <button onClick={() => { setShowDetailModal(false); handleAddEntryForStaff(selectedStaff) }}
                className="mt-4 w-full bg-[#2c3e7e] text-white py-2 rounded-lg hover:bg-[#477fc1] transition-colors text-sm">
                + Log Leave Entry for {selectedStaff.full_name}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          Modal: Edit Leave Entry
      ══════════════════════════════════════════════════════ */}
      {showEditModal && editingEntry && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-bold text-[#2c3e7e]">Edit Leave Entry</h3>
                  <p className="text-sm text-[#666666] mt-0.5">{getStaffName(editingEntry.staff_id)}</p>
                </div>
                <button onClick={() => setShowEditModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
              </div>

              {/* Balance disclaimer */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4 text-xs text-amber-800">
                ⚠️ Editing an entry does not automatically adjust leave balances. If the amount changed, update the balance in the staff detail view.
              </div>

              <div className="space-y-4">
                {/* Leave Type */}
                <div>
                  <label className="block text-sm font-medium text-[#666666] mb-1">Leave Type *</label>
                  <select value={editForm.leave_type_id}
                    onChange={e => setEditForm(p => ({
                      ...p, leave_type_id: e.target.value,
                      qualifying_reason: '', qualifying_relationship: '', relationship_name: '',
                    }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]">
                    <option value="">Select leave type...</option>
                    <optgroup label="School-Provided">
                      {leaveTypes.filter(t => t.category === 'school_provided').map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </optgroup>
                    <optgroup label="Federal">
                      {leaveTypes.filter(t => t.category === 'federal').map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </optgroup>
                    <optgroup label="Oregon State">
                      {leaveTypes.filter(t => t.category === 'state').map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </optgroup>
                  </select>
                </div>

                {/* Qualifying info (protected leave only) */}
                {editIsProtected && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-blue-700 text-sm font-bold">Qualifying Information</span>
                      <span className="text-xs text-blue-500 font-medium px-2 py-0.5 bg-blue-100 rounded-full">{editLeaveType?.name}</span>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-blue-800 mb-1">Qualifying Reason</label>
                      <select value={editForm.qualifying_reason}
                        onChange={e => setEditForm(p => ({ ...p, qualifying_reason: e.target.value }))}
                        className="w-full border border-blue-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                        <option value="">Select reason...</option>
                        {editFilteredReasons.map(r => <option key={r.id} value={r.qualifying_reason}>{r.display_name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-blue-800 mb-1">Relationship to Employee</label>
                      <select value={editForm.qualifying_relationship}
                        onChange={e => setEditForm(p => ({
                          ...p, qualifying_relationship: e.target.value,
                          relationship_name: e.target.value === 'self' ? '' : p.relationship_name,
                        }))}
                        className="w-full border border-blue-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                        <option value="">Select relationship...</option>
                        {editFilteredRelationships.map(r => <option key={r.id} value={r.qualifying_relationship}>{r.display_name}</option>)}
                      </select>
                    </div>
                    {editForm.qualifying_relationship && !editIsSelf && (
                      <div>
                        <label className="block text-sm font-semibold text-blue-800 mb-1">
                          Family Member Name <span className="font-normal text-blue-500">(optional)</span>
                        </label>
                        <input type="text" value={editForm.relationship_name}
                          onChange={e => setEditForm(p => ({ ...p, relationship_name: e.target.value }))}
                          placeholder="e.g. Jane Smith"
                          className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400" />
                      </div>
                    )}
                  </div>
                )}

                {/* Dates */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-[#666666] mb-1">Start Date *</label>
                    <input type="date" value={editForm.start_date}
                      onChange={e => setEditForm(p => ({ ...p, start_date: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#666666] mb-1">End Date *</label>
                    <input type="date" value={editForm.end_date}
                      onChange={e => setEditForm(p => ({ ...p, end_date: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]" />
                  </div>
                </div>

                {/* Amount + unit */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-[#666666] mb-1">Amount *</label>
                    <input type="number" step="0.5" min="0" value={editForm.amount}
                      onChange={e => setEditForm(p => ({ ...p, amount: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#666666] mb-1">Unit</label>
                    <select value={editForm.tracking_unit}
                      onChange={e => setEditForm(p => ({ ...p, tracking_unit: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]">
                      <option value="days">Days</option>
                      <option value="hours">Hours</option>
                      <option value="weeks">Weeks</option>
                    </select>
                  </div>
                </div>

                {/* Concurrent */}
                <div>
                  <label className="block text-sm font-medium text-[#666666] mb-1">Running Concurrently With (optional)</label>
                  <select value={editForm.concurrent_leave_type_id}
                    onChange={e => setEditForm(p => ({ ...p, concurrent_leave_type_id: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]">
                    <option value="">None</option>
                    {leaveTypes.filter(t => t.id !== editForm.leave_type_id).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>

                {/* Reason */}
                <div>
                  <label className="block text-sm font-medium text-[#666666] mb-1">Notes / Reason (optional)</label>
                  <textarea rows={2} value={editForm.reason}
                    onChange={e => setEditForm(p => ({ ...p, reason: e.target.value }))}
                    placeholder="Optional notes..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]" />
                </div>

                {/* Documentation */}
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="edit-docs" checked={editForm.documentation_on_file}
                    onChange={e => setEditForm(p => ({ ...p, documentation_on_file: e.target.checked }))}
                    className="rounded border-gray-300" />
                  <label htmlFor="edit-docs" className="text-sm text-[#666666]">Documentation on file</label>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
                <button onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 text-sm text-[#666666] border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                <button onClick={handleSaveEdit} disabled={editSaving}
                  className="px-4 py-2 text-sm bg-[#2c3e7e] text-white rounded-lg hover:bg-[#477fc1] disabled:opacity-50 transition-colors">
                  {editSaving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default LeaveTracker
