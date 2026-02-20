import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import Navbar from '../components/Navbar'

// Protected leave type keywords - used to identify which leave types
// get rolling 12-month period tracking and proration
const PROTECTED_LEAVE_KEYWORDS = ['fmla', 'ofla', 'plo', 'paid leave oregon']

const isProtectedLeaveType = (leaveTypeName) => {
  const name = (leaveTypeName || '').toLowerCase()
  return PROTECTED_LEAVE_KEYWORDS.some(kw => name.includes(kw))
}

// Proration constants
const FULL_TIME_DAYS = 260
const BASE_ENTITLEMENT_HOURS = 480 // 12 weeks × 40 hours

function LeaveTracker() {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('dashboard')
  const [staff, setStaff] = useState([])
  const [leaveTypes, setLeaveTypes] = useState([])
  const [leavePolicies, setLeavePolicies] = useState([])
  const [leaveBalances, setLeaveBalances] = useState([])
  const [leaveEntries, setLeaveEntries] = useState([])
  const [protectedPeriods, setProtectedPeriods] = useState([])
  const [odeRecords, setOdeRecords] = useState([])
  const [selectedStaff, setSelectedStaff] = useState(null)
  const [showEntryModal, setShowEntryModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [schoolYear] = useState('2025-2026')
  const [showHireDateModal, setShowHireDateModal] = useState(false)
  const [hireDateStaff, setHireDateStaff] = useState(null)
  const [hireDateValue, setHireDateValue] = useState('')
  const [saving, setSaving] = useState(false)

  const HOURS_PER_DAY = 8
  const DAYS_PER_WEEK = 5
  const HOURS_PER_WEEK = 40

  const [newEntry, setNewEntry] = useState({
    staff_id: '',
    leave_type_id: '',
    start_date: '',
    end_date: '',
    amount: '',
    tracking_unit: 'hours',
    concurrent_leave_type_id: '',
    reason: '',
    documentation_on_file: false
  })

  // Eligibility rules
  const ELIGIBILITY_RULES = [
    { keyword: 'fmla', label: 'FMLA', minDays: 365, source: 'Federal — 12 months + 1,250 hours worked' },
    { keyword: 'ofla', label: 'OFLA', minDays: 180, source: 'Oregon State — 180 days of employment' },
    { keyword: 'plo', label: 'PLO', minDays: 0, source: 'Oregon State — Day 1, no waiting period' },
    { keyword: 'paid leave oregon', label: 'PLO', minDays: 0, source: 'Oregon State — Day 1, no waiting period' },
    { keyword: 'sick', label: 'Oregon Sick Time', minDays: 0, source: 'Oregon State — Day 1, accrual begins immediately' },
    { keyword: 'bereavement', label: 'Bereavement', minDays: 0, source: 'Oregon State — Day 1' },
  ]

  // ── Data Fetching ──────────────────────────────────────

  useEffect(() => {
    if (profile) {
      fetchAllData()
    }
  }, [profile])

  const fetchAllData = async () => {
    setLoading(true)

    const { data: staffData } = await supabase
      .from('profiles')
      .select('*')
      .eq('tenant_id', profile.tenant_id)
      .in('role', ['licensed_staff', 'classified_staff'])
      .eq('is_active', true)
      .order('full_name')

    const { data: typesData } = await supabase
      .from('leave_types')
      .select('*')
      .eq('tenant_id', profile.tenant_id)
      .eq('is_active', true)
      .order('sort_order')

    const { data: policiesData } = await supabase
      .from('leave_policies')
      .select('*')
      .eq('tenant_id', profile.tenant_id)
      .eq('school_year', schoolYear)

    const { data: balancesData } = await supabase
      .from('leave_balances')
      .select('*')
      .eq('tenant_id', profile.tenant_id)
      .eq('school_year', schoolYear)

    const { data: entriesData } = await supabase
      .from('leave_entries')
      .select('*')
      .eq('tenant_id', profile.tenant_id)
      .eq('school_year', schoolYear)
      .order('start_date', { ascending: false })

    // Fetch protected leave periods (all active + recently expired)
    const { data: periodsData } = await supabase
      .from('protected_leave_periods')
      .select('*')
      .eq('tenant_id', profile.tenant_id)
      .in('status', ['active', 'exhausted'])
      .order('period_start_date', { ascending: false })

    // Fetch ODE records for contract_length
    const { data: odeData } = await supabase
      .from('staff_ode_data')
      .select('staff_id, contract_length')
      .eq('tenant_id', profile.tenant_id)
      .eq('school_year', schoolYear)

    if (staffData) setStaff(staffData)
    if (typesData) setLeaveTypes(typesData)
    if (policiesData) setLeavePolicies(policiesData)
    if (balancesData) setLeaveBalances(balancesData)
    if (entriesData) setLeaveEntries(entriesData)
    if (periodsData) {
      // Auto-expire periods that have passed their end date
      const now = new Date()
      const updated = (periodsData || []).map(p => {
        if (p.status === 'active' && new Date(p.period_end_date) < now) {
          // Mark expired in DB asynchronously
          supabase.from('protected_leave_periods')
            .update({ status: 'expired' })
            .eq('id', p.id)
            .then(() => {})
          return { ...p, status: 'expired' }
        }
        return p
      })
      setProtectedPeriods(updated.filter(p => p.status !== 'expired'))
    }
    if (odeData) setOdeRecords(odeData)

    setLoading(false)
  }

  // ── Contract Length & Proration ────────────────────────

  const getContractDays = (staffId) => {
    const ode = odeRecords.find(r => r.staff_id === staffId)
    return ode?.contract_length || null
  }

  const getProratedEntitlement = (staffId) => {
    const contractDays = getContractDays(staffId)
    if (!contractDays) return null // Unknown — can't calculate
    const ratio = contractDays / FULL_TIME_DAYS
    return Math.round((ratio * BASE_ENTITLEMENT_HOURS) * 100) / 100
  }

  const formatProration = (staffId) => {
    const contractDays = getContractDays(staffId)
    const entitlement = getProratedEntitlement(staffId)
    if (!contractDays || !entitlement) return null
    const pct = Math.round((contractDays / FULL_TIME_DAYS) * 100)
    return `${contractDays}-day contract (${pct}%) → ${entitlement.toFixed(2)} hrs`
  }

  // ── Protected Leave Period Logic ──────────────────────

  // Get the active period for a staff + leave type, or null
  const getActivePeriod = (staffId, leaveTypeId) => {
    const now = new Date()
    return protectedPeriods.find(p =>
      p.staff_id === staffId &&
      p.leave_type_id === leaveTypeId &&
      p.status === 'active' &&
      new Date(p.period_end_date) >= now
    ) || null
  }

  // Get the most recent period (active or exhausted) for display
  const getLatestPeriod = (staffId, leaveTypeId) => {
    return protectedPeriods.find(p =>
      p.staff_id === staffId &&
      p.leave_type_id === leaveTypeId
    ) || null
  }

  // Create a new rolling period starting from the leave entry date
  const createProtectedPeriod = async (staffId, leaveTypeId, startDate) => {
    const contractDays = getContractDays(staffId) || FULL_TIME_DAYS
    const ratio = contractDays / FULL_TIME_DAYS
    const proratedHours = Math.round((ratio * BASE_ENTITLEMENT_HOURS) * 100) / 100

    // Period end = start + 12 months
    const start = new Date(startDate)
    const end = new Date(start)
    end.setFullYear(end.getFullYear() + 1)
    // Subtract one day so period is exactly 12 months (e.g., Feb 1 → Jan 31)
    end.setDate(end.getDate() - 1)

    const periodData = {
      tenant_id: profile.tenant_id,
      staff_id: staffId,
      leave_type_id: leaveTypeId,
      period_start_date: startDate,
      period_end_date: end.toISOString().split('T')[0],
      contract_days: contractDays,
      full_time_days: FULL_TIME_DAYS,
      base_entitlement_hours: BASE_ENTITLEMENT_HOURS,
      prorated_entitlement_hours: proratedHours,
      hours_used: 0,
      status: 'active',
      created_by: profile.id
    }

    const { data, error } = await supabase
      .from('protected_leave_periods')
      .insert([periodData])
      .select()

    if (error) {
      console.error('Error creating protected leave period:', error)
      return null
    }

    if (data && data[0]) {
      setProtectedPeriods(prev => [data[0], ...prev])
      return data[0]
    }
    return null
  }

  // Update hours used on a period
  const updatePeriodHours = async (periodId, additionalHours) => {
    const period = protectedPeriods.find(p => p.id === periodId)
    if (!period) return

    const newHoursUsed = parseFloat(period.hours_used) + additionalHours
    const newStatus = newHoursUsed >= parseFloat(period.prorated_entitlement_hours) ? 'exhausted' : 'active'

    const { data, error } = await supabase
      .from('protected_leave_periods')
      .update({ hours_used: newHoursUsed, status: newStatus })
      .eq('id', periodId)
      .select()

    if (!error && data) {
      setProtectedPeriods(prev => prev.map(p => p.id === periodId ? data[0] : p))
    }
  }

  // Reverse hours from a period (when deleting an entry)
  const reversePeriodHours = async (periodId, hoursToReverse) => {
    const period = protectedPeriods.find(p => p.id === periodId)
    if (!period) return

    const newHoursUsed = Math.max(0, parseFloat(period.hours_used) - hoursToReverse)
    const newStatus = newHoursUsed >= parseFloat(period.prorated_entitlement_hours) ? 'exhausted' : 'active'

    const { data, error } = await supabase
      .from('protected_leave_periods')
      .update({ hours_used: newHoursUsed, status: newStatus })
      .eq('id', periodId)
      .select()

    if (!error && data) {
      setProtectedPeriods(prev => prev.map(p => p.id === periodId ? data[0] : p))
    }
  }

  // Convert entry amount to hours based on tracking unit
  const toHours = (amount, unit) => {
    const num = parseFloat(amount)
    if (unit === 'hours') return num
    if (unit === 'days') return num * HOURS_PER_DAY
    if (unit === 'weeks') return num * HOURS_PER_WEEK
    return num
  }

  // ── Balance Initialization ────────────────────────────

  const initializeBalances = async (staffId) => {
    const existingBalances = leaveBalances.filter(b => b.staff_id === staffId)
    if (existingBalances.length > 0) return

    const newBalances = leaveTypes.map(lt => {
      const policy = leavePolicies.find(p => p.leave_type_id === lt.id)
      const typeName = lt.name?.toLowerCase() || ''
      const isProtected = isProtectedLeaveType(typeName)

      // Protected leave types: don't allocate in balances (tracked via periods)
      // School-provided: use policy allocation
      return {
        tenant_id: profile.tenant_id,
        staff_id: staffId,
        leave_type_id: lt.id,
        school_year: schoolYear,
        allocated: isProtected ? 0 : (policy?.days_per_year || 0),
        used: 0,
        carried_over: 0,
        tracking_unit: isProtected ? 'hours' : (policy?.tracking_unit || 'days')
      }
    })

    const { data, error } = await supabase
      .from('leave_balances')
      .insert(newBalances)
      .select()

    if (!error && data) {
      setLeaveBalances(prev => [...prev, ...data])
    }
  }

  // ── Save Leave Entry ──────────────────────────────────

  const handleSaveEntry = async () => {
    if (!newEntry.staff_id || !newEntry.leave_type_id || !newEntry.start_date || !newEntry.end_date || !newEntry.amount) {
      alert('Please fill in all required fields.')
      return
    }

    setSaving(true)

    const leaveType = leaveTypes.find(t => t.id === newEntry.leave_type_id)
    const isProtected = leaveType ? isProtectedLeaveType(leaveType.name) : false
    const hoursAmount = toHours(newEntry.amount, newEntry.tracking_unit)

    // For protected leave: check/create rolling period
    let periodId = null
    if (isProtected) {
      let activePeriod = getActivePeriod(newEntry.staff_id, newEntry.leave_type_id)

      if (!activePeriod) {
        // No active period — create one starting from this entry's start date
        activePeriod = await createProtectedPeriod(
          newEntry.staff_id,
          newEntry.leave_type_id,
          newEntry.start_date
        )
        if (!activePeriod) {
          alert('Error creating protected leave period. Please try again.')
          setSaving(false)
          return
        }
      }

      // Check if hours would exceed entitlement
      const remaining = parseFloat(activePeriod.prorated_entitlement_hours) - parseFloat(activePeriod.hours_used)
      if (hoursAmount > remaining) {
        const proceed = confirm(
          `This entry (${hoursAmount.toFixed(2)} hrs) would exceed the remaining entitlement ` +
          `(${remaining.toFixed(2)} hrs of ${parseFloat(activePeriod.prorated_entitlement_hours).toFixed(2)} hrs).\n\n` +
          `Period: ${new Date(activePeriod.period_start_date).toLocaleDateString()} – ` +
          `${new Date(activePeriod.period_end_date).toLocaleDateString()}\n\n` +
          `Continue anyway?`
        )
        if (!proceed) {
          setSaving(false)
          return
        }
      }

      periodId = activePeriod.id
    }

    // Save the entry — always store amount in the selected tracking unit
    const entryData = {
      tenant_id: profile.tenant_id,
      staff_id: newEntry.staff_id,
      leave_type_id: newEntry.leave_type_id,
      school_year: schoolYear,
      start_date: newEntry.start_date,
      end_date: newEntry.end_date,
      amount: parseFloat(newEntry.amount),
      tracking_unit: newEntry.tracking_unit,
      concurrent_leave_type_id: newEntry.concurrent_leave_type_id || null,
      reason: newEntry.reason || null,
      documentation_on_file: newEntry.documentation_on_file,
      entered_by: profile.id
    }

    const { data, error } = await supabase
      .from('leave_entries')
      .insert([entryData])
      .select()

    if (error) {
      alert('Error saving entry: ' + error.message)
      setSaving(false)
      return
    }

    // Update protected leave period hours
    if (isProtected && periodId) {
      await updatePeriodHours(periodId, hoursAmount)
    }

    // Update school-provided balance (non-protected leave types)
    if (!isProtected) {
      const existingBalance = leaveBalances.find(
        b => b.staff_id === newEntry.staff_id && b.leave_type_id === newEntry.leave_type_id && b.school_year === schoolYear
      )
      if (existingBalance) {
        // Convert to the balance's tracking unit for storage
        const balanceUnit = existingBalance.tracking_unit || 'days'
        let amountInBalanceUnit = parseFloat(newEntry.amount)
        if (newEntry.tracking_unit === 'hours' && balanceUnit === 'days') {
          amountInBalanceUnit = parseFloat(newEntry.amount) / HOURS_PER_DAY
        } else if (newEntry.tracking_unit === 'days' && balanceUnit === 'hours') {
          amountInBalanceUnit = parseFloat(newEntry.amount) * HOURS_PER_DAY
        }

        const newUsed = parseFloat(existingBalance.used) + amountInBalanceUnit
        const { data: updatedBalance } = await supabase
          .from('leave_balances')
          .update({ used: newUsed })
          .eq('id', existingBalance.id)
          .select()

        if (updatedBalance) {
          setLeaveBalances(prev => prev.map(b => b.id === existingBalance.id ? updatedBalance[0] : b))
        }
      }
    }

    // Also handle concurrent leave — if logging FMLA concurrent with PLO,
    // we need to also deduct from the concurrent leave's period
    if (newEntry.concurrent_leave_type_id) {
      const concurrentType = leaveTypes.find(t => t.id === newEntry.concurrent_leave_type_id)
      if (concurrentType && isProtectedLeaveType(concurrentType.name)) {
        let concurrentPeriod = getActivePeriod(newEntry.staff_id, newEntry.concurrent_leave_type_id)
        if (!concurrentPeriod) {
          concurrentPeriod = await createProtectedPeriod(
            newEntry.staff_id,
            newEntry.concurrent_leave_type_id,
            newEntry.start_date
          )
        }
        if (concurrentPeriod) {
          await updatePeriodHours(concurrentPeriod.id, hoursAmount)
        }
      }
    }

    setLeaveEntries(prev => [data[0], ...prev])
    setShowEntryModal(false)
    setNewEntry({
      staff_id: '',
      leave_type_id: '',
      start_date: '',
      end_date: '',
      amount: '',
      tracking_unit: 'hours',
      concurrent_leave_type_id: '',
      reason: '',
      documentation_on_file: false
    })
    setSaving(false)
  }

  // ── Delete Leave Entry ────────────────────────────────

  const handleDeleteEntry = async (entry) => {
    if (!confirm('Are you sure you want to delete this leave entry? This will reverse the balance/period usage.')) return

    const leaveType = leaveTypes.find(t => t.id === entry.leave_type_id)
    const isProtected = leaveType ? isProtectedLeaveType(leaveType.name) : false
    const hoursAmount = toHours(entry.amount, entry.tracking_unit)

    const { error } = await supabase
      .from('leave_entries')
      .delete()
      .eq('id', entry.id)

    if (error) return

    // Reverse protected leave period hours
    if (isProtected) {
      // Find the period that was active when this entry was made
      const relevantPeriod = protectedPeriods.find(p =>
        p.staff_id === entry.staff_id &&
        p.leave_type_id === entry.leave_type_id &&
        new Date(entry.start_date) >= new Date(p.period_start_date) &&
        new Date(entry.start_date) <= new Date(p.period_end_date)
      )
      if (relevantPeriod) {
        await reversePeriodHours(relevantPeriod.id, hoursAmount)
      }
    }

    // Reverse school-provided balance
    if (!isProtected) {
      const existingBalance = leaveBalances.find(
        b => b.staff_id === entry.staff_id && b.leave_type_id === entry.leave_type_id && b.school_year === schoolYear
      )
      if (existingBalance) {
        const balanceUnit = existingBalance.tracking_unit || 'days'
        let amountInBalanceUnit = parseFloat(entry.amount)
        if (entry.tracking_unit === 'hours' && balanceUnit === 'days') {
          amountInBalanceUnit = parseFloat(entry.amount) / HOURS_PER_DAY
        } else if (entry.tracking_unit === 'days' && balanceUnit === 'hours') {
          amountInBalanceUnit = parseFloat(entry.amount) * HOURS_PER_DAY
        }

        const newUsed = Math.max(0, parseFloat(existingBalance.used) - amountInBalanceUnit)
        const { data: updatedBalance } = await supabase
          .from('leave_balances')
          .update({ used: newUsed })
          .eq('id', existingBalance.id)
          .select()

        if (updatedBalance) {
          setLeaveBalances(prev => prev.map(b => b.id === existingBalance.id ? updatedBalance[0] : b))
        }
      }
    }

    // Reverse concurrent leave period if applicable
    if (entry.concurrent_leave_type_id) {
      const concurrentType = leaveTypes.find(t => t.id === entry.concurrent_leave_type_id)
      if (concurrentType && isProtectedLeaveType(concurrentType.name)) {
        const concurrentPeriod = protectedPeriods.find(p =>
          p.staff_id === entry.staff_id &&
          p.leave_type_id === entry.concurrent_leave_type_id &&
          new Date(entry.start_date) >= new Date(p.period_start_date) &&
          new Date(entry.start_date) <= new Date(p.period_end_date)
        )
        if (concurrentPeriod) {
          await reversePeriodHours(concurrentPeriod.id, hoursAmount)
        }
      }
    }

    setLeaveEntries(prev => prev.filter(e => e.id !== entry.id))
  }

  // ── Hire Date ─────────────────────────────────────────

  const handleSaveHireDate = async () => {
    if (!hireDateStaff || !hireDateValue) return
    const { error } = await supabase
      .from('profiles')
      .update({ hire_date: hireDateValue })
      .eq('id', hireDateStaff.id)

    if (!error) {
      setStaff(prev => prev.map(s => s.id === hireDateStaff.id ? { ...s, hire_date: hireDateValue } : s))
    }
    setShowHireDateModal(false)
    setHireDateStaff(null)
    setHireDateValue('')
  }

  // ── View Helpers ──────────────────────────────────────

  const handleViewStaff = async (staffMember) => {
    setSelectedStaff(staffMember)
    await initializeBalances(staffMember.id)
    setShowDetailModal(true)
  }

  const handleAddEntryForStaff = (staffMember) => {
    setNewEntry(prev => ({ ...prev, staff_id: staffMember.id }))
    setShowEntryModal(true)
  }

  const getTypeName = (typeId) => leaveTypes.find(t => t.id === typeId)?.name || 'Unknown'
  const getTypeCategory = (typeId) => leaveTypes.find(t => t.id === typeId)?.category || ''
  const getStaffName = (staffId) => staff.find(s => s.id === staffId)?.full_name || 'Unknown'

  const calculateTenure = (hireDate) => {
    if (!hireDate) return null
    const hire = new Date(hireDate)
    const now = new Date()
    let years = now.getFullYear() - hire.getFullYear()
    let months = now.getMonth() - hire.getMonth()
    if (months < 0) { years--; months += 12 }
    if (now.getDate() < hire.getDate()) { months--; if (months < 0) { years--; months += 12 } }
    const totalDays = Math.floor((now - hire) / (1000 * 60 * 60 * 24))
    return { years: Math.max(0, years), months: Math.max(0, months), totalDays }
  }

  const formatTenureShort = (hireDate) => {
    const t = calculateTenure(hireDate)
    if (!t) return null
    if (t.years === 0 && t.months === 0) return '<1m'
    if (t.years === 0) return `${t.months}m`
    return `${t.years}y ${t.months}m`
  }

  const getStaffBalances = (staffId) => {
    return leaveTypes.map(lt => {
      const balance = leaveBalances.find(b => b.staff_id === staffId && b.leave_type_id === lt.id)
      const policy = leavePolicies.find(p => p.leave_type_id === lt.id)
      return {
        type: lt,
        policy,
        balance: balance || { allocated: policy?.days_per_year || 0, used: 0, carried_over: 0, tracking_unit: 'days' }
      }
    })
  }

  const getStaffEntries = (staffId) => leaveEntries.filter(e => e.staff_id === staffId)

  const getCategoryColor = (category) => {
    switch (category) {
      case 'school_provided': return 'bg-blue-100 text-blue-800'
      case 'state': return 'bg-green-100 text-green-800'
      case 'federal': return 'bg-purple-100 text-purple-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getUsagePercent = (used, allocated) => {
    if (!allocated || allocated === 0) return 0
    return Math.min(100, Math.round((used / allocated) * 100))
  }

  const getBarColor = (percent) => {
    if (percent >= 90) return 'bg-red-500'
    if (percent >= 75) return 'bg-[#f3843e]'
    if (percent >= 50) return 'bg-yellow-400'
    return 'bg-green-500'
  }

  const getIneligibleStaff = () => {
    const results = []
    staff.forEach(s => {
      if (!s.hire_date) return
      const tenure = calculateTenure(s.hire_date)
      if (!tenure) return
      ELIGIBILITY_RULES.forEach(rule => {
        if (rule.minDays === 0) return
        if (tenure.totalDays < rule.minDays) {
          results.push({
            staffId: s.id,
            staffName: s.full_name,
            ruleLabel: rule.label,
            daysRemaining: rule.minDays - tenure.totalDays,
            source: rule.source
          })
        }
      })
    })
    return results
  }

  // Compute protected leave summary for a staff card
  const getProtectedLeaveSummary = (staffId) => {

  // Get eligibility alerts for a specific staff member
  const getStaffEligibilityAlerts = (staffMember) => {
    if (!staffMember.hire_date) return []
    const tenure = calculateTenure(staffMember.hire_date)
    if (!tenure) return []
    const alerts = []
    ELIGIBILITY_RULES.forEach(rule => {
      if (rule.minDays === 0) return
      if (tenure.totalDays < rule.minDays) {
        alerts.push({
          ruleLabel: rule.label,
          daysRemaining: rule.minDays - tenure.totalDays
        })
      }
    })
    return alerts
  }
    return leaveTypes
      .filter(lt => isProtectedLeaveType(lt.name))
      .map(lt => {
        const period = getLatestPeriod(staffId, lt.id)
        const entitlement = getProratedEntitlement(staffId)
        return {
          type: lt,
          period,
          entitlement,
          contractDays: getContractDays(staffId)
        }
      })
  }

  // ── Filters & Stats ───────────────────────────────────

  const filteredStaff = staff.filter(s =>
    s.full_name?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const totalStaff = staff.length
  const staffWithLeave = [...new Set(leaveEntries.map(e => e.staff_id))].length
  const totalEntriesThisYear = leaveEntries.length
  const staffApproachingLimits = staff.filter(s => {
    // Check school-provided balances
    const balances = getStaffBalances(s.id)
    const schoolLimitHit = balances.some(b => {
      if (isProtectedLeaveType(b.type.name)) return false
      const allocated = parseFloat(b.balance.allocated) + parseFloat(b.balance.carried_over || 0)
      const used = parseFloat(b.balance.used)
      return allocated > 0 && (used / allocated) >= 0.75
    })
    // Check protected leave periods
    const protectedLimitHit = protectedPeriods.some(p => {
      if (p.staff_id !== s.id || p.status !== 'active') return false
      const pct = parseFloat(p.hours_used) / parseFloat(p.prorated_entitlement_hours)
      return pct >= 0.75
    })
    return schoolLimitHit || protectedLimitHit
  }).length

  // ── Loading State ─────────────────────────────────────

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

  // ── Render ────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-100">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <div>
            <h2 className="text-2xl font-bold text-[#2c3e7e]">Leave Tracker</h2>
            <p className="text-[#666666] text-sm mt-1">School Year: {schoolYear}</p>
          </div>
          <button
            onClick={() => setShowEntryModal(true)}
            className="bg-[#2c3e7e] text-white px-4 py-2 rounded-lg hover:bg-[#477fc1] transition-colors"
          >
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
            { id: 'dashboard', label: 'Staff Overview' },
            { id: 'entries', label: 'All Entries' },
            { id: 'compliance', label: 'Compliance Notes' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-[#2c3e7e] text-[#2c3e7e]'
                  : 'border-transparent text-[#666666] hover:text-[#2c3e7e]'
              }`}
            >{tab.label}</button>
          ))}
        </div>

        {/* ═══ Tab: Staff Overview ═══ */}
        {activeTab === 'dashboard' && (
          <div>
            <div className="mb-4">
              <input
                type="text"
                placeholder="Search staff..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full sm:w-64 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredStaff.map(s => {
                const balances = getStaffBalances(s.id)
                const schoolProvided = balances.filter(b => b.type.category === 'school_provided')
                const protectedSummary = getProtectedLeaveSummary(s.id)
                const entries = getStaffEntries(s.id)
                const tenure = formatTenureShort(s.hire_date)
                const contractDays = getContractDays(s.id)
                const eligibilityAlerts = getStaffEligibilityAlerts(s)

                return (
                  <div key={s.id} className="bg-white rounded-lg shadow p-4">
                    {/* Staff Header */}
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="font-semibold text-[#2c3e7e]">{s.full_name}</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-sm text-[#666666]">{s.position_type || s.role}</p>
                          {tenure && <span className="text-xs text-[#999]">({tenure})</span>}
                          {contractDays && (
                            <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                              {contractDays}-day
                            </span>
                          )}
                        </div>
                        {eligibilityAlerts.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {eligibilityAlerts.map((alert, idx) => (
                              <span key={idx} className="inline-flex items-center gap-1 text-xs bg-yellow-50 border border-yellow-200 text-yellow-800 px-2 py-0.5 rounded">
                                <span className="font-medium">{alert.ruleLabel}</span>
                                <span className="text-yellow-600">— {alert.daysRemaining}d until eligible</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAddEntryForStaff(s)}
                          className="text-xs bg-[#2c3e7e] text-white px-3 py-1 rounded hover:bg-[#477fc1] transition-colors"
                        >+ Log Leave</button>
                        <button
                          onClick={() => handleViewStaff(s)}
                          className="text-xs bg-gray-100 text-[#2c3e7e] px-3 py-1 rounded hover:bg-gray-200 transition-colors"
                        >View Details</button>
                      </div>
                    </div>

                    {/* School-Provided Balances (days) */}
                    <div className="space-y-2">
                      {schoolProvided.map(b => {
                        const allocated = parseFloat(b.balance.allocated) + parseFloat(b.balance.carried_over || 0)
                        const used = parseFloat(b.balance.used)
                        const remaining = Math.max(0, allocated - used)
                        const percent = getUsagePercent(used, allocated)

                        return (
                          <div key={b.type.id}>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-[#666666]">{b.type.name}</span>
                              <span className="font-medium text-[#2c3e7e]">
                                {remaining} of {allocated} days remaining
                              </span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div
                                className={`h-2 rounded-full transition-all ${getBarColor(percent)}`}
                                style={{ width: `${percent}%` }}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Protected Leave (FMLA/OFLA/PLO) — Hours-based */}
                    {protectedSummary.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <p className="text-xs text-[#666666] font-medium mb-2">Protected Leave (Hours)</p>
                        <div className="space-y-2">
                          {protectedSummary.map(ps => {
                            const period = ps.period
                            const entitlement = ps.entitlement
                            if (!period && !entitlement) {
                              // No contract data and no period
                              return (
                                <div key={ps.type.id} className="flex items-center gap-2">
                                  <span className={`text-xs px-2 py-0.5 rounded-full ${getCategoryColor(ps.type.category)}`}>
                                    {ps.type.name}
                                  </span>
                                  <span className="text-xs text-gray-400">No contract data</span>
                                </div>
                              )
                            }

                            if (period) {
                              // Has an active/exhausted period
                              const totalHrs = parseFloat(period.prorated_entitlement_hours)
                              const usedHrs = parseFloat(period.hours_used)
                              const remainHrs = Math.max(0, totalHrs - usedHrs)
                              const pct = getUsagePercent(usedHrs, totalHrs)
                              const periodStart = new Date(period.period_start_date).toLocaleDateString()
                              const periodEnd = new Date(period.period_end_date).toLocaleDateString()

                              return (
                                <div key={ps.type.id}>
                                  <div className="flex justify-between text-xs mb-1">
                                    <span className={`px-2 py-0.5 rounded-full ${getCategoryColor(ps.type.category)}`}>
                                      {ps.type.name}
                                    </span>
                                    <span className="font-medium text-[#2c3e7e]">
                                      {remainHrs.toFixed(1)} of {totalHrs.toFixed(1)} hrs remaining
                                    </span>
                                  </div>
                                  <div className="w-full bg-gray-200 rounded-full h-2">
                                    <div
                                      className={`h-2 rounded-full transition-all ${getBarColor(pct)}`}
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                  <p className="text-xs text-gray-400 mt-0.5">
                                    Period: {periodStart} – {periodEnd}
                                    {period.status === 'exhausted' && (
                                      <span className="text-red-500 font-medium ml-1">• Exhausted</span>
                                    )}
                                  </p>
                                </div>
                              )
                            }

                            // No period yet — show entitlement available
                            return (
                              <div key={ps.type.id} className="flex justify-between items-center">
                                <span className={`text-xs px-2 py-0.5 rounded-full ${getCategoryColor(ps.type.category)}`}>
                                  {ps.type.name}
                                </span>
                                <span className="text-xs text-[#666666]">
                                  {entitlement?.toFixed(1)} hrs available • Not yet used
                                </span>
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

            {filteredStaff.length === 0 && (
              <div className="text-center py-12 text-[#666666]">
                {searchTerm ? 'No staff match your search.' : 'No staff found.'}
              </div>
            )}
          </div>
        )}

        {/* ═══ Tab: All Entries ═══ */}
        {activeTab === 'entries' && (
          <div>
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <input
                type="text"
                placeholder="Search by staff name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
              />
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
              >
                <option value="all">All Leave Types</option>
                {leaveTypes.map(lt => (
                  <option key={lt.id} value={lt.id}>{lt.name}</option>
                ))}
              </select>
            </div>

            <div className="bg-white rounded-lg shadow overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#666666] uppercase">Staff</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#666666] uppercase">Leave Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#666666] uppercase">Dates</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#666666] uppercase">Amount</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#666666] uppercase">Concurrent</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#666666] uppercase">Docs</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#666666] uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {leaveEntries
                    .filter(e => {
                      const matchesSearch = !searchTerm || getStaffName(e.staff_id).toLowerCase().includes(searchTerm.toLowerCase())
                      const matchesType = filterType === 'all' || e.leave_type_id === filterType
                      return matchesSearch && matchesType
                    })
                    .map(entry => (
                      <tr key={entry.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium text-[#2c3e7e]">{getStaffName(entry.staff_id)}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`px-2 py-0.5 rounded-full text-xs ${getCategoryColor(getTypeCategory(entry.leave_type_id))}`}>
                            {getTypeName(entry.leave_type_id)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-[#666666]">
                          {new Date(entry.start_date).toLocaleDateString()} – {new Date(entry.end_date).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-sm text-[#666666]">
                          {entry.amount} {entry.tracking_unit}
                          {entry.tracking_unit !== 'hours' && (
                            <span className="text-xs text-gray-400 ml-1">
                              ({toHours(entry.amount, entry.tracking_unit).toFixed(1)} hrs)
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-[#666666]">
                          {entry.concurrent_leave_type_id ? (
                            <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full">
                              + {getTypeName(entry.concurrent_leave_type_id)}
                            </span>
                          ) : '–'}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {entry.documentation_on_file ? (
                            <span className="text-green-600">✔</span>
                          ) : (
                            <span className="text-gray-300">–</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <button
                            onClick={() => handleDeleteEntry(entry)}
                            className="text-red-500 hover:text-red-700 text-xs"
                          >Delete</button>
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

        {/* ═══ Tab: Compliance Notes ═══ */}
        {activeTab === 'compliance' && (
          <div className="space-y-4">
            {/* Protected Leave Proration Reference */}
            <div className="bg-white rounded-lg shadow p-4">
              <h3 className="font-semibold text-[#2c3e7e] mb-2">Protected Leave Proration Reference</h3>
              <p className="text-sm text-[#666666] mb-3">
                FMLA, OFLA, and PLO entitlements are prorated by contract length. Full-time (260 days) = 480 hours (12 weeks × 40 hrs/week).
              </p>
              <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-3">
                <p className="text-xs font-medium text-blue-800 mb-1">Formula</p>
                <p className="text-xs text-blue-700 font-mono">(contract_days / 260) × 480 = prorated entitlement hours</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                {[260, 235, 220, 205, 200, 192].map(days => (
                  <div key={days} className="bg-gray-50 rounded p-2">
                    <span className="font-medium text-[#2c3e7e]">{days}-day:</span>{' '}
                    <span className="text-[#666666]">{((days / 260) * 480).toFixed(2)} hrs</span>
                    <span className="text-gray-400 ml-1">({Math.round((days / 260) * 100)}%)</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Rolling Period Explanation */}
            <div className="bg-white rounded-lg shadow p-4">
              <h3 className="font-semibold text-[#2c3e7e] mb-2">Rolling 12-Month Leave Periods</h3>
              <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mb-3">
                <p className="text-xs font-medium text-yellow-800 mb-1">How It Works</p>
                <p className="text-xs text-yellow-700">
                  FMLA, OFLA, and PLO each have independent rolling 12-month periods measured forward from the date the employee first uses that specific leave type.
                  The period renews 12 months after first use with full entitlement restored.
                  Each leave type tracks separately — an employee's FMLA year, OFLA year, and PLO year can all start on different dates.
                </p>
              </div>
              <div className="bg-purple-50 border border-purple-200 rounded p-3">
                <p className="text-xs font-medium text-purple-800 mb-1">Concurrent Leave</p>
                <p className="text-xs text-purple-700">
                  FMLA and PLO may run concurrently for the same qualifying event.
                  OFLA and PLO no longer run concurrently (as of July 2024).
                  When leave runs concurrently, hours are deducted from both leave types' periods.
                </p>
              </div>
            </div>

            {/* Leave type compliance cards */}
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
                    {isProtectedLeaveType(lt.name) && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-800">Rolling Period • Hours</span>
                    )}
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
                  {policy?.concurrent_with && policy.concurrent_with.length > 0 && (
                    <div className="bg-purple-50 border border-purple-200 rounded p-3">
                      <p className="text-xs font-medium text-purple-800 mb-1">Can Run Concurrently With:</p>
                      <p className="text-xs text-purple-700">{policy.concurrent_with.join(', ')}</p>
                    </div>
                  )}
                  {policy && (
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-[#666666]">
                      {isProtectedLeaveType(lt.name) ? (
                        <span>Entitlement: Up to 480 hrs (prorated by contract)</span>
                      ) : (
                        <>
                          {policy.days_per_year && <span>Allocation: {policy.days_per_year} days/year</span>}
                          {policy.weeks_per_year && <span>Allocation: {policy.weeks_per_year} weeks/year</span>}
                        </>
                      )}
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

      {/* ═══ Modal: Log Leave Entry ═══ */}
      {showEntryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-[#2c3e7e]">Log Leave Entry</h3>
                <button onClick={() => setShowEntryModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
              </div>

              <div className="space-y-4">
                {/* Staff Member */}
                <div>
                  <label className="block text-sm font-medium text-[#666666] mb-1">Staff Member *</label>
                  <select
                    value={newEntry.staff_id}
                    onChange={(e) => setNewEntry(prev => ({ ...prev, staff_id: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                  >
                    <option value="">Select staff member...</option>
                    {staff.map(s => {
                      const cd = getContractDays(s.id)
                      return (
                        <option key={s.id} value={s.id}>
                          {s.full_name}{cd ? ` (${cd}-day)` : ''}
                        </option>
                      )
                    })}
                  </select>
                </div>

                {/* Leave Type */}
                <div>
                  <label className="block text-sm font-medium text-[#666666] mb-1">Leave Type *</label>
                  <select
                    value={newEntry.leave_type_id}
                    onChange={(e) => {
                      const lt = leaveTypes.find(t => t.id === e.target.value)
                      const isProtected = lt ? isProtectedLeaveType(lt.name) : false
                      setNewEntry(prev => ({
                        ...prev,
                        leave_type_id: e.target.value,
                        tracking_unit: isProtected ? 'hours' : 'days'
                      }))
                    }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                  >
                    <option value="">Select leave type...</option>
                    <optgroup label="School-Provided">
                      {leaveTypes.filter(t => t.category === 'school_provided').map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Federal">
                      {leaveTypes.filter(t => t.category === 'federal').map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Oregon State">
                      {leaveTypes.filter(t => t.category === 'state').map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </optgroup>
                  </select>
                </div>

                {/* Protected Leave Info Banner */}
                {newEntry.leave_type_id && newEntry.staff_id && (() => {
                  const lt = leaveTypes.find(t => t.id === newEntry.leave_type_id)
                  if (!lt || !isProtectedLeaveType(lt.name)) return null
                  const activePeriod = getActivePeriod(newEntry.staff_id, newEntry.leave_type_id)
                  const entitlement = getProratedEntitlement(newEntry.staff_id)
                  const contractDays = getContractDays(newEntry.staff_id)

                  return (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="text-xs font-medium text-blue-800 mb-1">
                        {lt.name} — Protected Leave
                      </p>
                      {!contractDays && (
                        <p className="text-xs text-orange-700">
                          ⚠ No contract length on file — using full-time (260 days / 480 hrs). Update ODE Staff Position data for accurate proration.
                        </p>
                      )}
                      {contractDays && (
                        <p className="text-xs text-blue-700">
                          {contractDays}-day contract → {entitlement?.toFixed(2)} hrs entitlement ({Math.round((contractDays / FULL_TIME_DAYS) * 100)}% of 480)
                        </p>
                      )}
                      {activePeriod ? (
                        <p className="text-xs text-blue-700 mt-1">
                          Active period: {new Date(activePeriod.period_start_date).toLocaleDateString()} – {new Date(activePeriod.period_end_date).toLocaleDateString()}
                          {' • '}{(parseFloat(activePeriod.prorated_entitlement_hours) - parseFloat(activePeriod.hours_used)).toFixed(1)} hrs remaining
                        </p>
                      ) : (
                        <p className="text-xs text-blue-700 mt-1">
                          No active period — a new 12-month period will start from the entry's start date.
                        </p>
                      )}
                    </div>
                  )
                })()}

                {/* Date Range */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-[#666666] mb-1">Start Date *</label>
                    <input
                      type="date"
                      value={newEntry.start_date}
                      onChange={(e) => setNewEntry(prev => ({ ...prev, start_date: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#666666] mb-1">End Date *</label>
                    <input
                      type="date"
                      value={newEntry.end_date}
                      onChange={(e) => setNewEntry(prev => ({ ...prev, end_date: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                    />
                  </div>
                </div>

                {/* Amount + Unit */}
                <div>
                  <label className="block text-sm font-medium text-[#666666] mb-1">Amount *</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      value={newEntry.amount}
                      onChange={(e) => setNewEntry(prev => ({ ...prev, amount: e.target.value }))}
                      placeholder={`Number of ${newEntry.tracking_unit}`}
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                    />
                    <select
                      value={newEntry.tracking_unit}
                      onChange={(e) => setNewEntry(prev => ({ ...prev, tracking_unit: e.target.value }))}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                    >
                      <option value="hours">Hours</option>
                      <option value="days">Days</option>
                      <option value="weeks">Weeks</option>
                    </select>
                  </div>
                  {/* Live conversion display */}
                  {newEntry.amount && (
                    <p className="text-xs text-gray-400 mt-1">
                      {newEntry.tracking_unit === 'hours' && `= ${(parseFloat(newEntry.amount) / HOURS_PER_DAY).toFixed(2)} days = ${(parseFloat(newEntry.amount) / HOURS_PER_WEEK).toFixed(2)} weeks`}
                      {newEntry.tracking_unit === 'days' && `= ${(parseFloat(newEntry.amount) * HOURS_PER_DAY).toFixed(1)} hours = ${(parseFloat(newEntry.amount) / DAYS_PER_WEEK).toFixed(2)} weeks`}
                      {newEntry.tracking_unit === 'weeks' && `= ${(parseFloat(newEntry.amount) * DAYS_PER_WEEK).toFixed(1)} days = ${(parseFloat(newEntry.amount) * HOURS_PER_WEEK).toFixed(1)} hours`}
                    </p>
                  )}
                </div>

                {/* Concurrent Leave */}
                <div>
                  <label className="block text-sm font-medium text-[#666666] mb-1">Running Concurrently With (optional)</label>
                  <select
                    value={newEntry.concurrent_leave_type_id}
                    onChange={(e) => setNewEntry(prev => ({ ...prev, concurrent_leave_type_id: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                  >
                    <option value="">None</option>
                    {leaveTypes.filter(t => t.id !== newEntry.leave_type_id).map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                  {newEntry.concurrent_leave_type_id && (
                    <p className="text-xs text-yellow-700 mt-1">
                      ⚠ Hours will be deducted from both leave types' periods.
                    </p>
                  )}
                </div>

                {/* Reason */}
                <div>
                  <label className="block text-sm font-medium text-[#666666] mb-1">Notes / Reason (optional)</label>
                  <textarea
                    value={newEntry.reason}
                    onChange={(e) => setNewEntry(prev => ({ ...prev, reason: e.target.value }))}
                    rows={2}
                    placeholder="Optional notes..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                  />
                </div>

                {/* Documentation */}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="docs"
                    checked={newEntry.documentation_on_file}
                    onChange={(e) => setNewEntry(prev => ({ ...prev, documentation_on_file: e.target.checked }))}
                    className="rounded border-gray-300"
                  />
                  <label htmlFor="docs" className="text-sm text-[#666666]">Documentation on file</label>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowEntryModal(false)}
                  className="px-4 py-2 text-sm text-[#666666] border border-gray-300 rounded-lg hover:bg-gray-50"
                >Cancel</button>
                <button
                  onClick={handleSaveEntry}
                  disabled={saving}
                  className="px-4 py-2 text-sm bg-[#2c3e7e] text-white rounded-lg hover:bg-[#477fc1] transition-colors disabled:opacity-50"
                >{saving ? 'Saving...' : 'Save Entry'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Modal: Staff Detail ═══ */}
      {showDetailModal && selectedStaff && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="text-lg font-bold text-[#2c3e7e]">{selectedStaff.full_name}</h3>
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-[#666666]">{selectedStaff.position_type || selectedStaff.role} — {schoolYear}</p>
                    {getContractDays(selectedStaff.id) && (
                      <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                        {getContractDays(selectedStaff.id)}-day contract
                      </span>
                    )}
                  </div>
                  {selectedStaff.hire_date && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      Hired: {new Date(selectedStaff.hire_date).toLocaleDateString()}
                      {' • '}{formatTenureShort(selectedStaff.hire_date)} tenure
                    </p>
                  )}
                </div>
                <button onClick={() => setShowDetailModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
              </div>

              {/* School-Provided Leave Balances */}
              <h4 className="font-semibold text-[#2c3e7e] mb-3">School-Provided Leave</h4>
              <div className="space-y-3 mb-6">
                {getStaffBalances(selectedStaff.id)
                  .filter(b => !isProtectedLeaveType(b.type.name))
                  .map(b => {
                    const allocated = parseFloat(b.balance.allocated) + parseFloat(b.balance.carried_over || 0)
                    const used = parseFloat(b.balance.used)
                    const remaining = Math.max(0, allocated - used)
                    const percent = getUsagePercent(used, allocated)

                    return (
                      <div key={b.type.id} className="bg-gray-50 rounded-lg p-3">
                        <div className="flex justify-between items-center mb-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm text-[#2c3e7e]">{b.type.name}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${getCategoryColor(b.type.category)}`}>
                              {b.type.category === 'school_provided' ? 'School' : b.type.category === 'state' ? 'State' : 'Federal'}
                            </span>
                          </div>
                          <span className="text-sm font-medium text-[#2c3e7e]">
                            {used} / {allocated} days used
                          </span>
                        </div>
                        {allocated > 0 && (
                          <div className="w-full bg-gray-200 rounded-full h-2.5 mt-1">
                            <div
                              className={`h-2.5 rounded-full transition-all ${getBarColor(percent)}`}
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        )}
                        <div className="flex justify-between text-xs text-[#666666] mt-1">
                          <span>{remaining} days remaining ({(remaining * HOURS_PER_DAY).toFixed(0)} hrs)</span>
                          {parseFloat(b.balance.carried_over) > 0 && (
                            <span>(includes {b.balance.carried_over} carried over)</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
              </div>

              {/* Protected Leave Periods */}
              <h4 className="font-semibold text-[#2c3e7e] mb-3">Protected Leave (Rolling 12-Month Periods)</h4>
              <div className="space-y-3 mb-6">
                {leaveTypes.filter(lt => isProtectedLeaveType(lt.name)).map(lt => {
                  const period = getLatestPeriod(selectedStaff.id, lt.id)
                  const entitlement = getProratedEntitlement(selectedStaff.id)
                  const contractDays = getContractDays(selectedStaff.id)

                  return (
                    <div key={lt.id} className="bg-gray-50 rounded-lg p-3">
                      <div className="flex justify-between items-center mb-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-[#2c3e7e]">{lt.name}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${getCategoryColor(lt.category)}`}>
                            {lt.category === 'state' ? 'State' : 'Federal'}
                          </span>
                        </div>
                        {period ? (
                          <span className="text-sm font-medium text-[#2c3e7e]">
                            {parseFloat(period.hours_used).toFixed(1)} / {parseFloat(period.prorated_entitlement_hours).toFixed(1)} hrs used
                          </span>
                        ) : (
                          <span className="text-sm text-[#666666]">
                            {entitlement ? `${entitlement.toFixed(1)} hrs available` : 'No contract data'}
                          </span>
                        )}
                      </div>

                      {period && (
                        <>
                          <div className="w-full bg-gray-200 rounded-full h-2.5 mt-1">
                            <div
                              className={`h-2.5 rounded-full transition-all ${getBarColor(
                                getUsagePercent(parseFloat(period.hours_used), parseFloat(period.prorated_entitlement_hours))
                              )}`}
                              style={{ width: `${getUsagePercent(parseFloat(period.hours_used), parseFloat(period.prorated_entitlement_hours))}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-xs text-[#666666] mt-1">
                            <span>
                              {Math.max(0, parseFloat(period.prorated_entitlement_hours) - parseFloat(period.hours_used)).toFixed(1)} hrs remaining
                            </span>
                            <span>
                              Period: {new Date(period.period_start_date).toLocaleDateString()} – {new Date(period.period_end_date).toLocaleDateString()}
                              {period.status === 'exhausted' && (
                                <span className="text-red-500 font-medium ml-1">• Exhausted</span>
                              )}
                            </span>
                          </div>
                        </>
                      )}

                      {!period && (
                        <p className="text-xs text-gray-400 mt-1">
                          No leave used yet — period starts when first entry is logged.
                          {contractDays && ` (${contractDays}-day contract → ${entitlement?.toFixed(2)} hrs)`}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Leave History */}
              <h4 className="font-semibold text-[#2c3e7e] mb-3">Leave History</h4>
              {getStaffEntries(selectedStaff.id).length === 0 ? (
                <p className="text-sm text-[#666666]">No leave entries recorded.</p>
              ) : (
                <div className="space-y-2">
                  {getStaffEntries(selectedStaff.id).map(entry => (
                    <div key={entry.id} className="flex justify-between items-center bg-gray-50 rounded-lg p-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${getCategoryColor(getTypeCategory(entry.leave_type_id))}`}>
                            {getTypeName(entry.leave_type_id)}
                          </span>
                          <span className="text-sm text-[#666666]">
                            {new Date(entry.start_date).toLocaleDateString()} – {new Date(entry.end_date).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-sm text-[#2c3e7e] font-medium mt-1">
                          {entry.amount} {entry.tracking_unit}
                          {entry.tracking_unit !== 'hours' && (
                            <span className="text-xs text-gray-400 ml-1">
                              ({toHours(entry.amount, entry.tracking_unit).toFixed(1)} hrs)
                            </span>
                          )}
                          {entry.concurrent_leave_type_id && (
                            <span className="text-xs text-yellow-700 ml-2">
                              (concurrent with {getTypeName(entry.concurrent_leave_type_id)})
                            </span>
                          )}
                        </p>
                        {entry.reason && <p className="text-xs text-[#666666] mt-1">{entry.reason}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        {entry.documentation_on_file && <span className="text-green-600 text-xs">Docs ✔</span>}
                        <button
                          onClick={() => handleDeleteEntry(entry)}
                          className="text-red-400 hover:text-red-600 text-xs"
                        >Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={() => {
                  setShowDetailModal(false)
                  handleAddEntryForStaff(selectedStaff)
                }}
                className="mt-4 w-full bg-[#2c3e7e] text-white py-2 rounded-lg hover:bg-[#477fc1] transition-colors text-sm"
              >
                + Log Leave Entry for {selectedStaff.full_name}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Modal: Edit Hire Date ═══ */}
      {showHireDateModal && hireDateStaff && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm">
            <div className="p-6">
              <h3 className="text-lg font-bold text-[#2c3e7e] mb-4">Edit Hire Date</h3>
              <p className="text-sm text-[#666666] mb-3">{hireDateStaff.full_name}</p>
              <input
                type="date"
                value={hireDateValue}
                onChange={(e) => setHireDateValue(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1] mb-4"
              />
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => { setShowHireDateModal(false); setHireDateStaff(null) }}
                  className="px-4 py-2 text-sm text-[#666666] border border-gray-300 rounded-lg hover:bg-gray-50"
                >Cancel</button>
                <button
                  onClick={handleSaveHireDate}
                  className="px-4 py-2 text-sm bg-[#2c3e7e] text-white rounded-lg hover:bg-[#477fc1] transition-colors"
                >Save</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default LeaveTracker
