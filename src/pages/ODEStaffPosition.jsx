import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import Navbar from '../components/Navbar'

// ODE Position Codes - from 2023-24 ODE Staff Position Manual
const ODE_POSITION_CODES = [
  { code: '01', name: 'Superintendent', licensed: true },
  { code: '02', name: 'Assistant Superintendent', licensed: true },
  { code: '03', name: 'Principal', licensed: true },
  { code: '04', name: 'Assistant Principal', licensed: true },
  { code: '05', name: 'Head Teacher', licensed: true },
  { code: '06', name: 'Instructional Coordinators/Supervisors', licensed: true },
  { code: '07', name: 'Psychologist', licensed: true },
  { code: '08', name: 'Teacher', licensed: true },
  { code: '09', name: 'Library/Media Specialist', licensed: true },
  { code: '10', name: 'School Counselor', licensed: true },
  { code: '11', name: 'Other Licensed Staff', licensed: true },
  { code: '15', name: 'Nurse, Non-Special Ed', licensed: true },
  { code: '16', name: 'Paraprofessional (Educational Assistant)', licensed: false },
  { code: '17', name: 'District Support (Clerical)', licensed: false },
  { code: '18', name: 'School Support (Clerical)', licensed: false },
  { code: '19', name: 'Student Support (Coaches, Athletic Directors)', licensed: false },
  { code: '20', name: 'Library/Media Support', licensed: false },
  { code: '21', name: 'Other Non-Licensed Staff', licensed: false },
  { code: '22', name: 'Special Ed Teacher', licensed: true },
  { code: '23', name: 'Special Ed PE Teacher', licensed: true },
  { code: '24', name: 'Special Ed Speech Pathologist', licensed: true },
  { code: '25', name: 'Special Ed Audiologist', licensed: true },
  { code: '26', name: 'Special Ed Psychologist', licensed: true },
  { code: '27', name: 'Special Ed Counselor', licensed: true },
  { code: '28', name: 'Special Ed Social Worker', licensed: true },
  { code: '29', name: 'Special Ed Occupational Therapist', licensed: true },
  { code: '30', name: 'Special Ed Physical Therapist', licensed: true },
  { code: '31', name: 'Special Ed Nurse', licensed: true },
  { code: '32', name: 'Special Ed Diagnostician', licensed: true },
  { code: '33', name: 'Special Ed Orientation/Mobility Specialist', licensed: true },
  { code: '34', name: 'Special Ed Interpreter', licensed: false },
  { code: '35', name: 'Special Ed Paraprofessional', licensed: false },
  { code: '36', name: 'Special Ed Other Services (Licensed)', licensed: true },
  { code: '37', name: 'Special Ed Administrator', licensed: true },
  { code: '38', name: 'Special Ed Administrator, Other', licensed: true },
  { code: '39', name: 'Special Ed Administration Support (Clerical)', licensed: false },
  { code: '40', name: 'Special Ed Other Services (Non-Licensed)', licensed: false },
  { code: '41', name: 'Non-Special Ed Social Worker', licensed: true },
]

const EDUCATION_LEVELS = [
  { code: '1', name: 'Less than Baccalaureate' },
  { code: '2', name: 'Baccalaureate' },
  { code: '3', name: 'Baccalaureate + Additional Credits' },
  { code: '4', name: "Master's Degree" },
  { code: '5', name: 'Doctorate' },
]

const GRADE_CODES = [
  { code: 'PK', name: 'Pre-Kindergarten' },
  { code: 'KG', name: 'Kindergarten' },
  { code: '01', name: 'Grade 1' },
  { code: '02', name: 'Grade 2' },
  { code: '03', name: 'Grade 3' },
  { code: '04', name: 'Grade 4' },
  { code: '05', name: 'Grade 5' },
  { code: '06', name: 'Grade 6' },
  { code: '07', name: 'Grade 7' },
  { code: '08', name: 'Grade 8' },
  { code: '09', name: 'Grade 9' },
  { code: '10', name: 'Grade 10' },
  { code: '11', name: 'Grade 11' },
  { code: '12', name: 'Grade 12' },
  { code: 'UG', name: 'Ungraded' },
]

const SPED_AGE_GROUPS = [
  { code: '0', name: 'Not Special Ed' },
  { code: '1', name: 'Birth to 2' },
  { code: '2', name: 'Ages 3-5' },
  { code: '3', name: 'Ages 6-21' },
  { code: '4', name: 'All Ages' },
]

const STATE_CODES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC','PR','GU','VI','AS','MP','FN'
]

function ODEStaffPosition() {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [staff, setStaff] = useState([])
  const [odeRecords, setOdeRecords] = useState([])
  const [showEditModal, setShowEditModal] = useState(false)
  const [showBulkEditModal, setShowBulkEditModal] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState(null)
  const [selectedStaffId, setSelectedStaffId] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterPosition, setFilterPosition] = useState('all')
  const [schoolYear] = useState('2025-2026')
  const [saving, setSaving] = useState(false)
  const [exportLoading, setExportLoading] = useState(false)
  const [showExportPreview, setShowExportPreview] = useState(false)
  const [validationErrors, setValidationErrors] = useState([])
  const [successMessage, setSuccessMessage] = useState('')

  // Bulk edit state
  const [bulkField, setBulkField] = useState('')
  const [bulkValue, setBulkValue] = useState('')
  const [bulkSelected, setBulkSelected] = useState([])

  // Default form state
  const emptyRecord = {
    usid: '',
    tspc_account_id: '',
    employer_institution_id: '',
    employer_staff_id: '',
    ssn_last_four: '',
    assigned_institution_id: '',
    last_name: '',
    first_name: '',
    middle_initial: '',
    birth_date: '',
    gender: '',
    hispanic_ethnic_flag: false,
    race_american_indian: false,
    race_asian: false,
    race_black: false,
    race_white: false,
    race_pacific_islander: false,
    position_code: '08',
    position_comment: '',
    fte: '1.000',
    licensed_flag: true,
    base_salary: '',
    hourly_rate: '',
    pers_pickup_flag: false,
    contract_length: '',
    full_contract_length: '',
    level_of_education: '',
    years_in_district: 0,
    years_in_oregon: 0,
    years_outside_oregon: 0,
    low_grade_code: '',
    high_grade_code: '',
    special_ed_age_group_code: '0',
    hq_paraprofessional_flag: false,
    last_state_of_residence: 'OR',
    language_origin_code: '',
    status: 'draft',
    notes: ''
  }

  useEffect(() => {
    if (profile) {
      fetchAllData()
    }
  }, [profile])

  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(''), 3000)
      return () => clearTimeout(timer)
    }
  }, [successMessage])

  const fetchAllData = async () => {
    setLoading(true)

    // Fetch staff
    const { data: staffData } = await supabase
      .from('profiles')
      .select('*')
      .eq('tenant_id', profile.tenant_id)
      .in('role', ['licensed_staff', 'classified_staff'])
      .eq('is_active', true)
      .order('full_name')

    // Fetch ODE records
    const { data: odeData } = await supabase
      .from('staff_ode_data')
      .select('*')
      .eq('tenant_id', profile.tenant_id)
      .eq('school_year', schoolYear)
      .order('last_name')

    setStaff(staffData || [])
    setOdeRecords(odeData || [])
    setLoading(false)
  }

  // ── Helpers ──────────────────────────────────

  const getPositionName = (code) => {
    const pos = ODE_POSITION_CODES.find(p => p.code === code)
    return pos ? `${pos.code} - ${pos.name}` : code
  }

  const getPositionShortName = (code) => {
    const pos = ODE_POSITION_CODES.find(p => p.code === code)
    return pos ? pos.name : code
  }

  const getStaffName = (staffId) => {
    const s = staff.find(st => st.id === staffId)
    return s ? s.full_name : 'Unknown'
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'complete': return 'bg-green-100 text-green-800'
      case 'exported': return 'bg-blue-100 text-blue-800'
      default: return 'bg-yellow-100 text-yellow-800'
    }
  }

  const getCompletionPercent = (record) => {
    const requiredFields = [
      'last_name', 'first_name', 'position_code', 'fte',
      'birth_date', 'gender', 'employer_institution_id', 'assigned_institution_id',
      'level_of_education', 'contract_length', 'low_grade_code', 'high_grade_code'
    ]
    const filled = requiredFields.filter(f => record[f] && record[f] !== '').length
    return Math.round((filled / requiredFields.length) * 100)
  }

  const staffWithoutRecords = staff.filter(
    s => !odeRecords.some(r => r.staff_id === s.id)
  )

  // ── Validation ──────────────────────────────────

  const validateRecord = (record) => {
    const errors = []
    if (!record.last_name) errors.push('Last name is required')
    if (!record.first_name) errors.push('First name is required')
    if (!record.position_code) errors.push('Position code is required')
    if (!record.fte || parseFloat(record.fte) <= 0) errors.push('FTE must be greater than 0')
    if (!record.employer_institution_id) errors.push('Employer Institution ID is required')
    if (!record.assigned_institution_id) errors.push('Assigned Institution ID is required')
    if (!record.birth_date) errors.push('Birth date is required')
    if (!record.gender) errors.push('Gender is required')
    if (!record.level_of_education) errors.push('Level of education is required')
    if (!record.contract_length) errors.push('Contract length is required')
    if (!record.low_grade_code) errors.push('Low grade code is required')
    if (!record.high_grade_code) errors.push('High grade code is required')

    // Position-specific validations
    const posCode = parseInt(record.position_code)
    if (posCode >= 22 && posCode <= 40 && record.special_ed_age_group_code === '0') {
      errors.push('Special Ed positions require a Special Ed Age Group code')
    }
    if (record.position_code === '16' && !record.hq_paraprofessional_flag) {
      errors.push('Paraprofessional HQ flag should be set for position code 16')
    }

    // Race check - at least one race must be selected
    if (!record.race_american_indian && !record.race_asian && !record.race_black && 
        !record.race_white && !record.race_pacific_islander) {
      errors.push('At least one race/ethnicity must be selected')
    }

    return errors
  }

  const validateAllForExport = () => {
    const allErrors = []
    odeRecords.forEach(record => {
      const errors = validateRecord(record)
      if (errors.length > 0) {
        allErrors.push({
          staff: `${record.last_name}, ${record.first_name}`,
          staff_id: record.staff_id,
          record_id: record.id,
          errors
        })
      }
    })
    return allErrors
  }

  // ── CRUD ──────────────────────────────────

  const handleCreateRecord = (staffMember) => {
    const nameParts = (staffMember.full_name || '').split(' ')
    const firstName = nameParts[0] || ''
    const lastName = nameParts.length > 1 ? nameParts.slice(-1)[0] : ''
    const middleInitial = nameParts.length > 2 ? nameParts[1]?.[0] || '' : ''

    // Auto-set position code based on StaffTrak position_type
    let positionCode = '08' // default Teacher
    let licensedFlag = true
    const pt = staffMember.position_type?.toLowerCase()
    if (pt === 'school_counselor') { positionCode = '10'; licensedFlag = true }
    else if (pt === 'administrator') { positionCode = '03'; licensedFlag = true }
    else if (pt === 'special_education_director') { positionCode = '37'; licensedFlag = true }
    else if (pt === 'secretary' || pt === 'executive_assistant') { positionCode = '18'; licensedFlag = false }
    else if (pt === 'registrar') { positionCode = '18'; licensedFlag = false }
    else if (pt === 'student_advisor') { positionCode = '19'; licensedFlag = false }
    else if (pt === 'technology_lead') { positionCode = '21'; licensedFlag = false }
    else if (staffMember.staff_type === 'classified') { positionCode = '21'; licensedFlag = false }

    setSelectedRecord({
      ...emptyRecord,
      staff_id: staffMember.id,
      last_name: lastName,
      first_name: firstName,
      middle_initial: middleInitial,
      position_code: positionCode,
      licensed_flag: licensedFlag,
    })
    setSelectedStaffId(staffMember.id)
    setValidationErrors([])
    setShowEditModal(true)
  }

  const handleEditRecord = (record) => {
    setSelectedRecord({ ...record, birth_date: record.birth_date?.split('T')[0] || '' })
    setSelectedStaffId(record.staff_id)
    setValidationErrors([])
    setShowEditModal(true)
  }

  const handleSaveRecord = async () => {
    setSaving(true)
    const errors = validateRecord(selectedRecord)
    if (errors.length > 0) {
      setValidationErrors(errors)
      setSaving(false)
      return
    }

    const recordData = {
      ...selectedRecord,
      tenant_id: profile.tenant_id,
      school_year: schoolYear,
      fte: parseFloat(selectedRecord.fte) || 0,
      base_salary: selectedRecord.base_salary ? parseFloat(selectedRecord.base_salary) : null,
      hourly_rate: selectedRecord.hourly_rate ? parseFloat(selectedRecord.hourly_rate) : null,
      contract_length: selectedRecord.contract_length ? parseInt(selectedRecord.contract_length) : null,
      full_contract_length: selectedRecord.full_contract_length ? parseInt(selectedRecord.full_contract_length) : null,
      years_in_district: parseInt(selectedRecord.years_in_district) || 0,
      years_in_oregon: parseInt(selectedRecord.years_in_oregon) || 0,
      years_outside_oregon: parseInt(selectedRecord.years_outside_oregon) || 0,
    }

    // Remove fields that shouldn't be sent
    delete recordData.created_at
    delete recordData.updated_at

    let error
    if (selectedRecord.id) {
      // Update existing
      const { error: updateError } = await supabase
        .from('staff_ode_data')
        .update(recordData)
        .eq('id', selectedRecord.id)
      error = updateError
    } else {
      // Insert new
      delete recordData.id
      const { error: insertError } = await supabase
        .from('staff_ode_data')
        .insert([recordData])
      error = insertError
    }

    if (error) {
      console.error('Error saving ODE record:', error)
      setValidationErrors([error.message || 'Error saving record'])
    } else {
      setShowEditModal(false)
      setSelectedRecord(null)
      setSuccessMessage('ODE record saved successfully')
      fetchAllData()
    }
    setSaving(false)
  }

  const handleDeleteRecord = async (recordId) => {
    if (!confirm('Delete this ODE position record? This cannot be undone.')) return

    const { error } = await supabase
      .from('staff_ode_data')
      .delete()
      .eq('id', recordId)

    if (!error) {
      setSuccessMessage('Record deleted')
      fetchAllData()
    }
  }

  const handleMarkComplete = async (record) => {
    const errors = validateRecord(record)
    if (errors.length > 0) {
      alert(`Cannot mark complete. Missing fields:\n\n${errors.join('\n')}`)
      return
    }

    const { error } = await supabase
      .from('staff_ode_data')
      .update({ status: 'complete' })
      .eq('id', record.id)

    if (!error) {
      setSuccessMessage('Record marked as complete')
      fetchAllData()
    }
  }

  // ── Bulk Edit ──────────────────────────────────

  const handleBulkEdit = async () => {
    if (!bulkField || bulkValue === '' || bulkSelected.length === 0) return
    setSaving(true)

    const updateData = {}
    if (bulkField === 'years_in_district') updateData[bulkField] = parseInt(bulkValue)
    else if (bulkField === 'years_in_oregon') updateData[bulkField] = parseInt(bulkValue)
    else if (bulkField === 'employer_institution_id') updateData[bulkField] = bulkValue
    else if (bulkField === 'assigned_institution_id') updateData[bulkField] = bulkValue
    else if (bulkField === 'contract_length') updateData[bulkField] = parseInt(bulkValue)
    else if (bulkField === 'full_contract_length') updateData[bulkField] = parseInt(bulkValue)
    else if (bulkField === 'pers_pickup_flag') updateData[bulkField] = bulkValue === 'true'
    else if (bulkField === 'status') updateData[bulkField] = bulkValue
    else updateData[bulkField] = bulkValue

    const { error } = await supabase
      .from('staff_ode_data')
      .update(updateData)
      .in('id', bulkSelected)

    if (!error) {
      setSuccessMessage(`Updated ${bulkSelected.length} records`)
      setShowBulkEditModal(false)
      setBulkSelected([])
      setBulkField('')
      setBulkValue('')
      fetchAllData()
    }
    setSaving(false)
  }

  const handleIncrementYears = async () => {
    if (!confirm('Increment "Years in District" by 1 for ALL staff ODE records this year?')) return
    setSaving(true)

    // Get all records for this year, increment each
    for (const record of odeRecords) {
      await supabase
        .from('staff_ode_data')
        .update({ years_in_district: (record.years_in_district || 0) + 1 })
        .eq('id', record.id)
    }

    setSuccessMessage('Years in District incremented for all staff')
    fetchAllData()
    setSaving(false)
  }

  // ── Export ──────────────────────────────────

  const handleExportCSV = () => {
    // Validate all records first
    const exportErrors = validateAllForExport()
    if (exportErrors.length > 0) {
      setValidationErrors(exportErrors.map(e => `${e.staff}: ${e.errors.join(', ')}`))
      setShowExportPreview(true)
      return
    }

    // Generate CSV in ODE format
    const headers = [
      'ChkDigitStfID', 'TSPCAccntID', 'EmplyrInstID', 'EmplyrStaffID', 'SSN',
      'LNm', 'FNm', 'MI', 'BirthDtTxt', 'Gndr',
      'HispEthnicFg', 'AmerIndianAlsknNtvRaceFg', 'AsianRaceFg', 'BlackRaceFg',
      'WhiteRaceFg', 'PacIslndrRaceFg', 'USIDFill',
      'AssgnInstID', 'PstnCd', 'PstnCmnt', 'FTE',
      'BaseSal', 'HrlyRt', 'PERSPickUpFg', 'CntrctLgth',
      'LstStResdCd', 'PstnFill1',
      'LvlStfEdCd', 'YrsInDistCnt', 'YrsInORCnt', 'YrsOutORCnt',
      'LoGrdCd', 'HiGrdCd', 'SpEdAgeGrpCd', 'LicFg',
      'HQParaProfFg', 'FullCntrctLgth', 'LangOrgnCd', 'PstnFill2'
    ]

    const boolToFlag = (val) => val ? 'Y' : 'N'
    const formatDate = (dateStr) => {
      if (!dateStr) return ''
      const d = new Date(dateStr)
      return `${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getDate().toString().padStart(2,'0')}/${d.getFullYear()}`
    }

    const rows = odeRecords.map(r => [
      r.usid || '',
      r.tspc_account_id || '',
      r.employer_institution_id || '',
      r.employer_staff_id || '',
      r.ssn_last_four ? `XXX-XX-${r.ssn_last_four}` : '',
      r.last_name || '',
      r.first_name || '',
      r.middle_initial || '',
      formatDate(r.birth_date),
      r.gender || '',
      boolToFlag(r.hispanic_ethnic_flag),
      boolToFlag(r.race_american_indian),
      boolToFlag(r.race_asian),
      boolToFlag(r.race_black),
      boolToFlag(r.race_white),
      boolToFlag(r.race_pacific_islander),
      '', // USIDFill
      r.assigned_institution_id || '',
      r.position_code || '',
      r.position_comment || '',
      r.fte ? parseFloat(r.fte).toFixed(3) : '',
      r.base_salary ? parseFloat(r.base_salary).toFixed(2) : '',
      r.hourly_rate ? parseFloat(r.hourly_rate).toFixed(2) : '',
      boolToFlag(r.pers_pickup_flag),
      r.contract_length || '',
      r.last_state_of_residence || '',
      '', // PstnFill1
      r.level_of_education || '',
      r.years_in_district || '0',
      r.years_in_oregon || '0',
      r.years_outside_oregon || '0',
      r.low_grade_code || '',
      r.high_grade_code || '',
      r.special_ed_age_group_code || '',
      boolToFlag(r.licensed_flag),
      boolToFlag(r.hq_paraprofessional_flag),
      r.full_contract_length || '',
      r.language_origin_code || '',
      '' // PstnFill2
    ])

    const csvContent = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ODE_Staff_Position_${schoolYear.replace('-','_')}_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)

    // Mark all as exported
    odeRecords.forEach(async (r) => {
      await supabase
        .from('staff_ode_data')
        .update({ status: 'exported', last_exported_at: new Date().toISOString() })
        .eq('id', r.id)
    })

    setSuccessMessage(`Exported ${odeRecords.length} records to CSV`)
    fetchAllData()
  }

  // ── Filter ──────────────────────────────────

  const filteredRecords = odeRecords.filter(r => {
    const matchesSearch = searchTerm === '' ||
      r.last_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.first_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.position_code?.includes(searchTerm) ||
      getPositionShortName(r.position_code)?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = filterStatus === 'all' || r.status === filterStatus
    const matchesPosition = filterPosition === 'all' || r.position_code === filterPosition
    return matchesSearch && matchesStatus && matchesPosition
  })

  // Stats
  const totalRecords = odeRecords.length
  const completeRecords = odeRecords.filter(r => r.status === 'complete' || r.status === 'exported').length
  const draftRecords = odeRecords.filter(r => r.status === 'draft').length
  const missingStaff = staffWithoutRecords.length
  const totalFTE = odeRecords.reduce((sum, r) => sum + (parseFloat(r.fte) || 0), 0)

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 py-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#2c3e7e] mx-auto"></div>
          <p className="mt-4 text-[#666666]">Loading ODE data...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <div>
            <h2 className="text-2xl font-bold text-[#2c3e7e]">ODE Staff Position File</h2>
            <p className="text-[#666666] text-sm mt-1">
              Oregon Department of Education • {schoolYear} Staff Position Data
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setShowBulkEditModal(true)}
              disabled={odeRecords.length === 0}
              className="px-4 py-2 border border-[#2c3e7e] text-[#2c3e7e] rounded-lg hover:bg-blue-50 disabled:opacity-50 text-sm"
            >
              Bulk Edit
            </button>
            <button
              onClick={handleExportCSV}
              disabled={odeRecords.length === 0}
              className="px-4 py-2 bg-[#f3843e] text-white rounded-lg hover:bg-orange-500 disabled:opacity-50 text-sm"
            >
              Export ODE File
            </button>
          </div>
        </div>

        {/* Success Message */}
        {successMessage && (
          <div className="mb-4 p-3 bg-green-100 text-green-800 rounded-lg flex justify-between items-center">
            <span>✓ {successMessage}</span>
            <button onClick={() => setSuccessMessage('')} className="text-green-800 hover:text-green-900">×</button>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-[#666666]">Total Records</p>
            <p className="text-2xl font-bold text-[#2c3e7e]">{totalRecords}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-[#666666]">Complete</p>
            <p className="text-2xl font-bold text-green-600">{completeRecords}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-[#666666]">Draft</p>
            <p className="text-2xl font-bold text-yellow-600">{draftRecords}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-[#666666]">Missing Staff</p>
            <p className="text-2xl font-bold text-[#f3843e]">{missingStaff}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-[#666666]">Total FTE</p>
            <p className="text-2xl font-bold text-[#477fc1]">{totalFTE.toFixed(2)}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-white rounded-lg shadow p-1">
          {[
            { id: 'overview', label: 'Staff Records' },
            { id: 'missing', label: `Missing (${missingStaff})` },
            { id: 'validation', label: 'Validation' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-[#2c3e7e] text-white'
                  : 'text-[#666666] hover:bg-gray-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── TAB: Staff Records ── */}
        {activeTab === 'overview' && (
          <div className="bg-white rounded-lg shadow">
            {/* Filters */}
            <div className="p-4 border-b flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                placeholder="Search by name, position..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1] text-sm"
              />
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="all">All Statuses</option>
                <option value="draft">Draft</option>
                <option value="complete">Complete</option>
                <option value="exported">Exported</option>
              </select>
              <select
                value={filterPosition}
                onChange={(e) => setFilterPosition(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="all">All Positions</option>
                {ODE_POSITION_CODES.map(p => (
                  <option key={p.code} value={p.code}>{p.code} - {p.name}</option>
                ))}
              </select>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="text-left p-3 font-medium text-[#666666]">
                      <input
                        type="checkbox"
                        checked={bulkSelected.length === filteredRecords.length && filteredRecords.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) setBulkSelected(filteredRecords.map(r => r.id))
                          else setBulkSelected([])
                        }}
                        className="w-4 h-4"
                      />
                    </th>
                    <th className="text-left p-3 font-medium text-[#666666]">Name</th>
                    <th className="text-left p-3 font-medium text-[#666666]">Position</th>
                    <th className="text-left p-3 font-medium text-[#666666]">FTE</th>
                    <th className="text-left p-3 font-medium text-[#666666]">Licensed</th>
                    <th className="text-left p-3 font-medium text-[#666666]">Completion</th>
                    <th className="text-left p-3 font-medium text-[#666666]">Status</th>
                    <th className="text-left p-3 font-medium text-[#666666]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-[#666666]">
                        {odeRecords.length === 0
                          ? 'No ODE records yet. Go to the "Missing" tab to create records for your staff.'
                          : 'No records match your filters.'}
                      </td>
                    </tr>
                  ) : (
                    filteredRecords.map(record => {
                      const completion = getCompletionPercent(record)
                      return (
                        <tr key={record.id} className="border-b hover:bg-gray-50">
                          <td className="p-3">
                            <input
                              type="checkbox"
                              checked={bulkSelected.includes(record.id)}
                              onChange={(e) => {
                                if (e.target.checked) setBulkSelected([...bulkSelected, record.id])
                                else setBulkSelected(bulkSelected.filter(id => id !== record.id))
                              }}
                              className="w-4 h-4"
                            />
                          </td>
                          <td className="p-3">
                            <div className="font-medium text-[#2c3e7e]">{record.last_name}, {record.first_name} {record.middle_initial}</div>
                            {record.usid && <div className="text-xs text-[#666666]">USID: {record.usid}</div>}
                          </td>
                          <td className="p-3">
                            <div>{record.position_code} - {getPositionShortName(record.position_code)}</div>
                          </td>
                          <td className="p-3">{parseFloat(record.fte || 0).toFixed(3)}</td>
                          <td className="p-3">{record.licensed_flag ? '✓' : '—'}</td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-gray-200 rounded-full h-2 max-w-[80px]">
                                <div
                                  className={`h-2 rounded-full ${
                                    completion === 100 ? 'bg-green-500' : completion >= 75 ? 'bg-yellow-500' : 'bg-red-400'
                                  }`}
                                  style={{ width: `${completion}%` }}
                                ></div>
                              </div>
                              <span className="text-xs text-[#666666]">{completion}%</span>
                            </div>
                          </td>
                          <td className="p-3">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(record.status)}`}>
                              {record.status}
                            </span>
                          </td>
                          <td className="p-3">
                            <div className="flex gap-1">
                              <button
                                onClick={() => handleEditRecord(record)}
                                className="px-2 py-1 text-xs bg-[#477fc1] text-white rounded hover:bg-blue-600"
                              >
                                Edit
                              </button>
                              {record.status === 'draft' && (
                                <button
                                  onClick={() => handleMarkComplete(record)}
                                  className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                                >
                                  ✓
                                </button>
                              )}
                              <button
                                onClick={() => handleDeleteRecord(record.id)}
                                className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
                              >
                                ×
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Bulk action bar */}
            {bulkSelected.length > 0 && (
              <div className="p-3 bg-blue-50 border-t flex justify-between items-center">
                <span className="text-sm text-[#2c3e7e] font-medium">{bulkSelected.length} selected</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowBulkEditModal(true)}
                    className="px-3 py-1 text-sm bg-[#2c3e7e] text-white rounded hover:bg-[#1e2a5e]"
                  >
                    Bulk Edit Selected
                  </button>
                  <button
                    onClick={() => setBulkSelected([])}
                    className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-100"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TAB: Missing Staff ── */}
        {activeTab === 'missing' && (
          <div className="bg-white rounded-lg shadow">
            <div className="p-4 border-b flex justify-between items-center">
              <div>
                <h3 className="font-bold text-[#2c3e7e]">Staff Without ODE Records</h3>
                <p className="text-sm text-[#666666]">{staffWithoutRecords.length} staff members need ODE position records created</p>
              </div>
              {staffWithoutRecords.length > 0 && (
                <button
                  onClick={async () => {
                    if (!confirm(`Create draft ODE records for all ${staffWithoutRecords.length} staff members?`)) return
                    setSaving(true)
                    for (const s of staffWithoutRecords) {
                      const nameParts = (s.full_name || '').split(' ')
                      const firstName = nameParts[0] || ''
                      const lastName = nameParts.length > 1 ? nameParts.slice(-1)[0] : ''
                      const middleInitial = nameParts.length > 2 ? nameParts[1]?.[0] || '' : ''
                      
                      let positionCode = '08'
                      let licensedFlag = true
                      const pt = s.position_type?.toLowerCase()
                      if (pt === 'school_counselor') { positionCode = '10'; licensedFlag = true }
                      else if (pt === 'administrator') { positionCode = '03'; licensedFlag = true }
                      else if (pt === 'special_education_director') { positionCode = '37'; licensedFlag = true }
                      else if (pt === 'secretary' || pt === 'executive_assistant') { positionCode = '18'; licensedFlag = false }
                      else if (pt === 'registrar') { positionCode = '18'; licensedFlag = false }
                      else if (pt === 'student_advisor') { positionCode = '19'; licensedFlag = false }
                      else if (pt === 'technology_lead') { positionCode = '21'; licensedFlag = false }
                      else if (s.staff_type === 'classified') { positionCode = '21'; licensedFlag = false }

                      await supabase.from('staff_ode_data').insert([{
                        tenant_id: profile.tenant_id,
                        school_year: schoolYear,
                        staff_id: s.id,
                        last_name: lastName,
                        first_name: firstName,
                        middle_initial: middleInitial,
                        position_code: positionCode,
                        licensed_flag: licensedFlag,
                        fte: 1.0,
                        status: 'draft'
                      }])
                    }
                    setSuccessMessage(`Created ${staffWithoutRecords.length} draft records`)
                    fetchAllData()
                    setSaving(false)
                  }}
                  disabled={saving}
                  className="px-4 py-2 bg-[#2c3e7e] text-white rounded-lg hover:bg-[#1e2a5e] text-sm disabled:opacity-50"
                >
                  {saving ? 'Creating...' : `Create All (${staffWithoutRecords.length})`}
                </button>
              )}
            </div>

            {staffWithoutRecords.length === 0 ? (
              <div className="p-8 text-center text-[#666666]">
                <p className="text-lg mb-2">🎉 All staff have ODE records!</p>
                <p className="text-sm">Every active staff member has an ODE position record for {schoolYear}.</p>
              </div>
            ) : (
              <div className="divide-y">
                {staffWithoutRecords.map(s => (
                  <div key={s.id} className="p-4 flex justify-between items-center hover:bg-gray-50">
                    <div>
                      <div className="font-medium text-[#2c3e7e]">{s.full_name}</div>
                      <div className="text-sm text-[#666666]">
                        {s.staff_type === 'licensed' ? 'Licensed' : 'Classified'} • {s.position_type?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </div>
                    </div>
                    <button
                      onClick={() => handleCreateRecord(s)}
                      className="px-4 py-2 bg-[#477fc1] text-white rounded-lg hover:bg-blue-600 text-sm"
                    >
                      Create Record
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TAB: Validation ── */}
        {activeTab === 'validation' && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-[#2c3e7e]">Export Readiness Check</h3>
                <button
                  onClick={handleIncrementYears}
                  disabled={saving || odeRecords.length === 0}
                  className="px-4 py-2 border border-[#2c3e7e] text-[#2c3e7e] rounded-lg hover:bg-blue-50 text-sm disabled:opacity-50"
                >
                  {saving ? 'Updating...' : '+ Increment Years in District'}
                </button>
              </div>

              {odeRecords.length === 0 ? (
                <p className="text-[#666666]">No records to validate. Create ODE records first.</p>
              ) : (
                <>
                  {(() => {
                    const exportErrors = validateAllForExport()
                    if (exportErrors.length === 0) {
                      return (
                        <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                          <p className="text-green-800 font-medium">✓ All {odeRecords.length} records pass validation!</p>
                          <p className="text-green-700 text-sm mt-1">Ready to export ODE Staff Position File.</p>
                        </div>
                      )
                    }
                    return (
                      <div className="space-y-3">
                        <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                          <p className="text-red-800 font-medium">
                            {exportErrors.length} of {odeRecords.length} records have validation issues
                          </p>
                        </div>
                        {exportErrors.map((err, i) => (
                          <div key={i} className="p-3 border rounded-lg">
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="font-medium text-[#2c3e7e]">{err.staff}</p>
                                <ul className="mt-1 space-y-1">
                                  {err.errors.map((e, j) => (
                                    <li key={j} className="text-sm text-red-600">• {e}</li>
                                  ))}
                                </ul>
                              </div>
                              <button
                                onClick={() => {
                                  const record = odeRecords.find(r => r.id === err.record_id)
                                  if (record) handleEditRecord(record)
                                }}
                                className="px-3 py-1 text-xs bg-[#477fc1] text-white rounded hover:bg-blue-600"
                              >
                                Fix
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                </>
              )}
            </div>

            {/* ODE Field Reference */}
            <div className="bg-white rounded-lg shadow p-4">
              <h3 className="font-bold text-[#2c3e7e] mb-3">ODE Field Reference</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <h4 className="font-medium text-[#666666] mb-2">Education Level Codes</h4>
                  {EDUCATION_LEVELS.map(e => (
                    <div key={e.code} className="flex gap-2 py-1">
                      <span className="font-mono text-[#477fc1] w-6">{e.code}</span>
                      <span className="text-[#666666]">{e.name}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <h4 className="font-medium text-[#666666] mb-2">Special Ed Age Groups</h4>
                  {SPED_AGE_GROUPS.map(s => (
                    <div key={s.code} className="flex gap-2 py-1">
                      <span className="font-mono text-[#477fc1] w-6">{s.code}</span>
                      <span className="text-[#666666]">{s.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ── EDIT MODAL ── */}
      {showEditModal && selectedRecord && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-[#2c3e7e]">
                  {selectedRecord.id ? 'Edit' : 'Create'} ODE Position Record
                </h3>
                <button
                  onClick={() => { setShowEditModal(false); setSelectedRecord(null) }}
                  className="text-gray-500 hover:text-gray-700 text-2xl"
                >×</button>
              </div>

              {/* Staff name display */}
              <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                <p className="text-sm text-[#477fc1] font-medium">
                  Staff: {getStaffName(selectedRecord.staff_id || selectedStaffId)}
                </p>
              </div>

              {/* Validation Errors */}
              {validationErrors.length > 0 && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-800 font-medium text-sm mb-1">Please fix the following:</p>
                  {validationErrors.map((err, i) => (
                    <p key={i} className="text-red-600 text-sm">• {err}</p>
                  ))}
                </div>
              )}

              {/* Form Sections */}
              <div className="space-y-6">
                {/* ODE Identifiers */}
                <div>
                  <h4 className="text-sm font-bold text-[#2c3e7e] border-b pb-1 mb-3">ODE Identifiers</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-[#666666] mb-1">USID (Check Digit Staff ID)</label>
                      <input type="text" value={selectedRecord.usid || ''}
                        onChange={(e) => setSelectedRecord({...selectedRecord, usid: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#477fc1] focus:outline-none"
                        placeholder="ODE-assigned ID"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#666666] mb-1">TSPC Account ID</label>
                      <input type="text" value={selectedRecord.tspc_account_id || ''}
                        onChange={(e) => setSelectedRecord({...selectedRecord, tspc_account_id: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#477fc1] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#666666] mb-1">Employer Institution ID *</label>
                      <input type="text" value={selectedRecord.employer_institution_id || ''}
                        onChange={(e) => setSelectedRecord({...selectedRecord, employer_institution_id: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#477fc1] focus:outline-none"
                        placeholder="ODE employer ID"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#666666] mb-1">Assigned Institution ID *</label>
                      <input type="text" value={selectedRecord.assigned_institution_id || ''}
                        onChange={(e) => setSelectedRecord({...selectedRecord, assigned_institution_id: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#477fc1] focus:outline-none"
                        placeholder="ODE assigned ID"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#666666] mb-1">Employer Staff ID</label>
                      <input type="text" value={selectedRecord.employer_staff_id || ''}
                        onChange={(e) => setSelectedRecord({...selectedRecord, employer_staff_id: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#477fc1] focus:outline-none"
                        placeholder="District internal ID"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#666666] mb-1">SSN (Last 4 only)</label>
                      <input type="text" maxLength={4} value={selectedRecord.ssn_last_four || ''}
                        onChange={(e) => setSelectedRecord({...selectedRecord, ssn_last_four: e.target.value.replace(/\D/g, '').slice(0, 4)})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#477fc1] focus:outline-none"
                        placeholder="1234"
                      />
                      <p className="text-xs text-[#666666] mt-1">Full SSN handled separately for security</p>
                    </div>
                  </div>
                </div>

                {/* Demographics */}
                <div>
                  <h4 className="text-sm font-bold text-[#2c3e7e] border-b pb-1 mb-3">Demographics</h4>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-[#666666] mb-1">Last Name *</label>
                      <input type="text" value={selectedRecord.last_name || ''}
                        onChange={(e) => setSelectedRecord({...selectedRecord, last_name: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#477fc1] focus:outline-none"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#666666] mb-1">First Name *</label>
                      <input type="text" value={selectedRecord.first_name || ''}
                        onChange={(e) => setSelectedRecord({...selectedRecord, first_name: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#477fc1] focus:outline-none"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#666666] mb-1">Middle Initial</label>
                      <input type="text" maxLength={1} value={selectedRecord.middle_initial || ''}
                        onChange={(e) => setSelectedRecord({...selectedRecord, middle_initial: e.target.value.toUpperCase().slice(0, 1)})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#477fc1] focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <div>
                      <label className="block text-xs font-medium text-[#666666] mb-1">Birth Date *</label>
                      <input type="date" value={selectedRecord.birth_date || ''}
                        onChange={(e) => setSelectedRecord({...selectedRecord, birth_date: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#477fc1] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#666666] mb-1">Gender *</label>
                      <select value={selectedRecord.gender || ''}
                        onChange={(e) => setSelectedRecord({...selectedRecord, gender: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#477fc1] focus:outline-none"
                      >
                        <option value="">Select</option>
                        <option value="M">Male</option>
                        <option value="F">Female</option>
                        <option value="X">Non-Binary</option>
                      </select>
                    </div>
                  </div>
                  <div className="mt-3">
                    <label className="flex items-center gap-2 mb-2">
                      <input type="checkbox" checked={selectedRecord.hispanic_ethnic_flag || false}
                        onChange={(e) => setSelectedRecord({...selectedRecord, hispanic_ethnic_flag: e.target.checked})}
                        className="w-4 h-4 text-[#2c3e7e] rounded"
                      />
                      <span className="text-sm text-[#666666]">Hispanic/Latino Ethnicity</span>
                    </label>
                    <p className="text-xs font-medium text-[#666666] mb-2">Race (select all that apply) *</p>
                    <div className="flex flex-wrap gap-4">
                      {[
                        { field: 'race_american_indian', label: 'American Indian/Alaska Native' },
                        { field: 'race_asian', label: 'Asian' },
                        { field: 'race_black', label: 'Black/African American' },
                        { field: 'race_white', label: 'White' },
                        { field: 'race_pacific_islander', label: 'Native Hawaiian/Pacific Islander' },
                      ].map(race => (
                        <label key={race.field} className="flex items-center gap-2">
                          <input type="checkbox" checked={selectedRecord[race.field] || false}
                            onChange={(e) => setSelectedRecord({...selectedRecord, [race.field]: e.target.checked})}
                            className="w-4 h-4 text-[#2c3e7e] rounded"
                          />
                          <span className="text-sm text-[#666666]">{race.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Position */}
                <div>
                  <h4 className="text-sm font-bold text-[#2c3e7e] border-b pb-1 mb-3">Position</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-[#666666] mb-1">ODE Position Code *</label>
                      <select value={selectedRecord.position_code || ''}
                        onChange={(e) => {
                          const code = e.target.value
                          const pos = ODE_POSITION_CODES.find(p => p.code === code)
                          setSelectedRecord({
                            ...selectedRecord,
                            position_code: code,
                            licensed_flag: pos?.licensed || false,
                            special_ed_age_group_code: parseInt(code) >= 22 && parseInt(code) <= 40 ? selectedRecord.special_ed_age_group_code : '0'
                          })
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#477fc1] focus:outline-none"
                      >
                        <option value="">Select Position</option>
                        {ODE_POSITION_CODES.map(p => (
                          <option key={p.code} value={p.code}>
                            {p.code} - {p.name} {p.licensed ? '(Licensed)' : '(Non-Licensed)'}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#666666] mb-1">FTE *</label>
                      <input type="number" step="0.001" min="0" max="9.999" value={selectedRecord.fte || ''}
                        onChange={(e) => setSelectedRecord({...selectedRecord, fte: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#477fc1] focus:outline-none"
                        placeholder="1.000"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#666666] mb-1">Special Ed Age Group</label>
                      <select value={selectedRecord.special_ed_age_group_code || '0'}
                        onChange={(e) => setSelectedRecord({...selectedRecord, special_ed_age_group_code: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#477fc1] focus:outline-none"
                      >
                        {SPED_AGE_GROUPS.map(s => (
                          <option key={s.code} value={s.code}>{s.code} - {s.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#666666] mb-1">Low Grade *</label>
                      <select value={selectedRecord.low_grade_code || ''}
                        onChange={(e) => setSelectedRecord({...selectedRecord, low_grade_code: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#477fc1] focus:outline-none"
                      >
                        <option value="">Select</option>
                        {GRADE_CODES.map(g => (
                          <option key={g.code} value={g.code}>{g.code} - {g.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#666666] mb-1">High Grade *</label>
                      <select value={selectedRecord.high_grade_code || ''}
                        onChange={(e) => setSelectedRecord({...selectedRecord, high_grade_code: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#477fc1] focus:outline-none"
                      >
                        <option value="">Select</option>
                        {GRADE_CODES.map(g => (
                          <option key={g.code} value={g.code}>{g.code} - {g.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-[#666666] mb-1">Position Comment</label>
                      <input type="text" value={selectedRecord.position_comment || ''}
                        onChange={(e) => setSelectedRecord({...selectedRecord, position_comment: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#477fc1] focus:outline-none"
                        placeholder="Optional position description"
                      />
                    </div>
                    <div className="col-span-2 flex gap-4">
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={selectedRecord.licensed_flag || false}
                          onChange={(e) => setSelectedRecord({...selectedRecord, licensed_flag: e.target.checked})}
                          className="w-4 h-4 text-[#2c3e7e] rounded"
                        />
                        <span className="text-sm text-[#666666]">Licensed (TSPC)</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={selectedRecord.hq_paraprofessional_flag || false}
                          onChange={(e) => setSelectedRecord({...selectedRecord, hq_paraprofessional_flag: e.target.checked})}
                          className="w-4 h-4 text-[#2c3e7e] rounded"
                        />
                        <span className="text-sm text-[#666666]">HQ Paraprofessional</span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Compensation */}
                <div>
                  <h4 className="text-sm font-bold text-[#2c3e7e] border-b pb-1 mb-3">Compensation & Contract</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-[#666666] mb-1">Base Salary ($)</label>
                      <input type="number" step="0.01" value={selectedRecord.base_salary || ''}
                        onChange={(e) => setSelectedRecord({...selectedRecord, base_salary: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#477fc1] focus:outline-none"
                        placeholder="55000.00"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#666666] mb-1">Hourly Rate ($)</label>
                      <input type="number" step="0.01" value={selectedRecord.hourly_rate || ''}
                        onChange={(e) => setSelectedRecord({...selectedRecord, hourly_rate: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#477fc1] focus:outline-none"
                        placeholder="26.44"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#666666] mb-1">Contract Length (days) *</label>
                      <input type="number" value={selectedRecord.contract_length || ''}
                        onChange={(e) => setSelectedRecord({...selectedRecord, contract_length: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#477fc1] focus:outline-none"
                        placeholder="190"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#666666] mb-1">Full Contract Length (days)</label>
                      <input type="number" value={selectedRecord.full_contract_length || ''}
                        onChange={(e) => setSelectedRecord({...selectedRecord, full_contract_length: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#477fc1] focus:outline-none"
                        placeholder="190"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={selectedRecord.pers_pickup_flag || false}
                          onChange={(e) => setSelectedRecord({...selectedRecord, pers_pickup_flag: e.target.checked})}
                          className="w-4 h-4 text-[#2c3e7e] rounded"
                        />
                        <span className="text-sm text-[#666666]">Employer picks up PERS contribution</span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Education & Experience */}
                <div>
                  <h4 className="text-sm font-bold text-[#2c3e7e] border-b pb-1 mb-3">Education & Experience</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-[#666666] mb-1">Level of Education *</label>
                      <select value={selectedRecord.level_of_education || ''}
                        onChange={(e) => setSelectedRecord({...selectedRecord, level_of_education: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#477fc1] focus:outline-none"
                      >
                        <option value="">Select</option>
                        {EDUCATION_LEVELS.map(e => (
                          <option key={e.code} value={e.code}>{e.code} - {e.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#666666] mb-1">Years in District</label>
                      <input type="number" min="0" value={selectedRecord.years_in_district || 0}
                        onChange={(e) => setSelectedRecord({...selectedRecord, years_in_district: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#477fc1] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#666666] mb-1">Years in Oregon</label>
                      <input type="number" min="0" value={selectedRecord.years_in_oregon || 0}
                        onChange={(e) => setSelectedRecord({...selectedRecord, years_in_oregon: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#477fc1] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#666666] mb-1">Years Outside Oregon</label>
                      <input type="number" min="0" value={selectedRecord.years_outside_oregon || 0}
                        onChange={(e) => setSelectedRecord({...selectedRecord, years_outside_oregon: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#477fc1] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#666666] mb-1">Last State of Residence</label>
                      <select value={selectedRecord.last_state_of_residence || 'OR'}
                        onChange={(e) => setSelectedRecord({...selectedRecord, last_state_of_residence: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#477fc1] focus:outline-none"
                      >
                        {STATE_CODES.map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Other */}
                <div>
                  <h4 className="text-sm font-bold text-[#2c3e7e] border-b pb-1 mb-3">Other</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-[#666666] mb-1">Language Origin Code</label>
                      <input type="text" value={selectedRecord.language_origin_code || ''}
                        onChange={(e) => setSelectedRecord({...selectedRecord, language_origin_code: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#477fc1] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#666666] mb-1">Record Status</label>
                      <select value={selectedRecord.status || 'draft'}
                        onChange={(e) => setSelectedRecord({...selectedRecord, status: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#477fc1] focus:outline-none"
                      >
                        <option value="draft">Draft</option>
                        <option value="complete">Complete</option>
                        <option value="exported">Exported</option>
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-[#666666] mb-1">Notes</label>
                      <textarea value={selectedRecord.notes || ''}
                        onChange={(e) => setSelectedRecord({...selectedRecord, notes: e.target.value})}
                        rows={2}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#477fc1] focus:outline-none"
                        placeholder="Internal notes..."
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Save Buttons */}
              <div className="flex gap-3 mt-6 pt-4 border-t">
                <button
                  onClick={() => { setShowEditModal(false); setSelectedRecord(null) }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-[#666666] hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveRecord}
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-[#2c3e7e] text-white rounded-lg hover:bg-[#1e2a5e] disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Record'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── BULK EDIT MODAL ── */}
      {showBulkEditModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-[#2c3e7e]">Bulk Edit</h3>
                <button onClick={() => setShowBulkEditModal(false)} className="text-gray-500 hover:text-gray-700 text-2xl">×</button>
              </div>

              <p className="text-sm text-[#666666] mb-4">
                {bulkSelected.length > 0
                  ? `Editing ${bulkSelected.length} selected records`
                  : `Editing all ${odeRecords.length} records`}
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#666666] mb-1">Field to Update</label>
                  <select value={bulkField} onChange={(e) => { setBulkField(e.target.value); setBulkValue('') }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="">Select field...</option>
                    <option value="employer_institution_id">Employer Institution ID</option>
                    <option value="assigned_institution_id">Assigned Institution ID</option>
                    <option value="contract_length">Contract Length</option>
                    <option value="full_contract_length">Full Contract Length</option>
                    <option value="years_in_district">Years in District</option>
                    <option value="years_in_oregon">Years in Oregon</option>
                    <option value="pers_pickup_flag">PERS Pickup Flag</option>
                    <option value="status">Status</option>
                  </select>
                </div>

                {bulkField && (
                  <div>
                    <label className="block text-sm font-medium text-[#666666] mb-1">New Value</label>
                    {bulkField === 'pers_pickup_flag' ? (
                      <select value={bulkValue} onChange={(e) => setBulkValue(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      >
                        <option value="">Select...</option>
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                      </select>
                    ) : bulkField === 'status' ? (
                      <select value={bulkValue} onChange={(e) => setBulkValue(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      >
                        <option value="">Select...</option>
                        <option value="draft">Draft</option>
                        <option value="complete">Complete</option>
                      </select>
                    ) : (
                      <input type={['years_in_district', 'years_in_oregon', 'contract_length', 'full_contract_length'].includes(bulkField) ? 'number' : 'text'}
                        value={bulkValue} onChange={(e) => setBulkValue(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        placeholder="Enter value..."
                      />
                    )}
                  </div>
                )}
              </div>

              <div className="flex gap-3 mt-6">
                <button onClick={() => setShowBulkEditModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-[#666666] hover:bg-gray-50"
                >Cancel</button>
                <button onClick={() => {
                  if (bulkSelected.length === 0) {
                    setBulkSelected(odeRecords.map(r => r.id))
                  }
                  handleBulkEdit()
                }}
                  disabled={!bulkField || bulkValue === '' || saving}
                  className="flex-1 px-4 py-2 bg-[#2c3e7e] text-white rounded-lg hover:bg-[#1e2a5e] disabled:opacity-50"
                >
                  {saving ? 'Updating...' : 'Apply Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ODEStaffPosition
