import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import Navbar from '../components/Navbar'

function StaffImport() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(1) // 1=upload, 2=preview, 3=importing, 4=results
  const [rawData, setRawData] = useState([])
  const [parsedData, setParsedData] = useState([])
  const [existingEmails, setExistingEmails] = useState([])
  const [importResults, setImportResults] = useState({ success: 0, skipped: 0, errors: [] })
  const [fileName, setFileName] = useState('')

  useEffect(() => {
    if (profile) {
      fetchExistingEmails()
    }
  }, [profile])

  const fetchExistingEmails = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('email')
      .eq('tenant_id', profile.tenant_id)

    if (data) {
      setExistingEmails(data.map(d => d.email?.toLowerCase()))
    }
  }

  // --- Name Parsing ---
  const parseName = (rawName) => {
    if (!rawName) return { full_name: '', first_name: '', last_name: '', middle_initial: '' }
    
    const trimmed = rawName.trim()
    
    // Handle "LAST, FIRST M" format
    if (trimmed.includes(',')) {
      const [lastPart, firstPart] = trimmed.split(',').map(s => s.trim())
      const firstParts = firstPart.split(/\s+/)
      const firstName = firstParts[0] || ''
      // Middle initial: last part if it's 1-2 chars (like "R" or "R.")
      let middleInitial = ''
      if (firstParts.length > 1) {
        const lastToken = firstParts[firstParts.length - 1].replace('.', '')
        if (lastToken.length <= 2) {
          middleInitial = lastToken[0] || ''
        }
      }
      
      // Title case conversion
      const toTitleCase = (str) => str.toLowerCase().replace(/\b\w/g, l => l.toUpperCase())
      const formattedFirst = toTitleCase(firstName)
      const formattedLast = toTitleCase(lastPart)
      
      // Handle hyphenated/multi-word last names
      const full_name = `${formattedFirst} ${formattedLast}`
      
      return { full_name, first_name: formattedFirst, last_name: formattedLast, middle_initial: middleInitial.toUpperCase() }
    }
    
    // Handle "FIRST LAST" format
    const parts = trimmed.split(/\s+/)
    const toTitleCase = (str) => str.toLowerCase().replace(/\b\w/g, l => l.toUpperCase())
    if (parts.length === 1) {
      return { full_name: toTitleCase(parts[0]), first_name: toTitleCase(parts[0]), last_name: '', middle_initial: '' }
    }
    const firstName = toTitleCase(parts[0])
    const lastName = toTitleCase(parts[parts.length - 1])
    return { full_name: `${firstName} ${lastName}`, first_name: firstName, last_name: lastName, middle_initial: '' }
  }

  // --- Staff Type Mapping ---
  const mapStaffType = (csvType) => {
    if (!csvType) return { role: 'classified_staff', staff_type: 'classified' }
    const t = csvType.trim().toLowerCase()
    if (t === 'certified' || t === 'licensed') {
      return { role: 'licensed_staff', staff_type: 'licensed' }
    }
    // Classified and Confidential both map to classified_staff
    return { role: 'classified_staff', staff_type: 'classified' }
  }

  // --- Position Type Mapping ---
  const mapPositionType = (csvPosition, staffType) => {
    if (!csvPosition) return staffType === 'licensed' ? 'teacher' : 'advisor'
    const p = csvPosition.trim().toLowerCase()
    
    // Licensed positions
    if (p.includes('teacher') || p.includes('secondary teacher')) return 'teacher'
    if (p.includes('counselor')) return 'school_counselor'
    if (p.includes('case manager')) return 'case_manager'
    if (p.includes('principal')) return 'principal'
    if (p.includes('director')) return 'director'
    if (p.includes('instructional coach')) return 'instructional_coach'
    if (p.includes('curriculum')) return 'curriculum_specialist'
    
    // Classified positions
    if (p.includes('advisor')) return 'advisor'
    if (p.includes('student support')) return 'student_support'
    if (p.includes('educational assistant') || p.includes('para')) return 'paraprofessional'
    if (p.includes('registrar') || p.includes('regis')) return 'registrar'
    if (p.includes('receptionist')) return 'receptionist'
    if (p.includes('secretary') || p.includes('administrative support')) return 'secretary'
    if (p.includes('business office') || p.includes('bookkeep')) return 'office_manager'
    if (p.includes('it') || p.includes('technology')) return 'technology_lead'
    if (p.includes('translator') || p.includes('school support')) return 'translator'
    if (p.includes('community')) return 'community_partnerships'
    
    // Default based on staff type
    return staffType === 'licensed' ? 'teacher' : 'advisor'
  }

  // --- Date Parsing ---
  const parseDate = (csvDate) => {
    if (!csvDate) return null
    const trimmed = csvDate.trim()
    
    // Handle M/D/YY or M/DD/YY or MM/DD/YY format
    const parts = trimmed.split('/')
    if (parts.length === 3) {
      let [month, day, year] = parts.map(Number)
      // Handle 2-digit year
      if (year < 100) {
        year = year > 50 ? 1900 + year : 2000 + year
      }
      // Return as YYYY-MM-DD
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
    
    // Try ISO format
    if (trimmed.match(/^\d{4}-\d{2}-\d{2}$/)) return trimmed
    
    return null
  }

  // --- CSV Parsing ---
  const parseCSV = (text) => {
    const lines = text.split('\n').filter(line => line.trim())
    if (lines.length < 2) return []

    // Parse header
    const headers = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase())
    
    const rows = []
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i])
      const row = {}
      headers.forEach((h, idx) => {
        row[h] = values[idx]?.trim() || ''
      })
      rows.push(row)
    }
    return rows
  }

  // Handle quoted CSV fields
  const parseCSVLine = (line) => {
    const result = []
    let current = ''
    let inQuotes = false
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = !inQuotes
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current)
        current = ''
      } else {
        current += char
      }
    }
    result.push(current)
    return result
  }

  // --- File Upload Handler ---
  const handleFileUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setFileName(file.name)

    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target.result
      const raw = parseCSV(text)
      setRawData(raw)

      // Transform each row
      const parsed = raw.map((row, idx) => {
        const nameData = parseName(row.full_name || row.name || '')
        const typeData = mapStaffType(row.staff_type || row.type || '')
        const positionType = mapPositionType(row.position_type || row.position || '', typeData.staff_type)
        const hireDate = parseDate(row.hire_date || row.date || '')
        const email = (row.email || '').trim().toLowerCase()
        
        const isDuplicate = email && existingEmails.includes(email)
        const isMissingEmail = !email

        return {
          _rowIndex: idx + 2, // 1-based, +1 for header
          _original: row,
          _isDuplicate: isDuplicate,
          _isMissingEmail: isMissingEmail,
          _include: !isDuplicate && !isMissingEmail,
          full_name: nameData.full_name,
          first_name: nameData.first_name,
          last_name: nameData.last_name,
          middle_initial: nameData.middle_initial,
          email: email,
          role: typeData.role,
          staff_type: typeData.staff_type,
          position_type: positionType,
          hire_date: hireDate,
          original_position: row.position_type || row.position || '',
          original_staff_type: row.staff_type || row.type || '',
          is_evaluator: false,
          years_at_school: 1
        }
      })

      setParsedData(parsed)
      setStep(2)
    }
    reader.readAsText(file)
  }

  // --- Toggle Include ---
  const toggleInclude = (idx) => {
    setParsedData(prev => prev.map((row, i) => 
      i === idx ? { ...row, _include: !row._include } : row
    ))
  }

  // --- Edit Row ---
  const updateRow = (idx, field, value) => {
    setParsedData(prev => prev.map((row, i) => 
      i === idx ? { ...row, [field]: value } : row
    ))
  }

  // --- Import ---
  const handleImport = async () => {
    setStep(3)
    const toImport = parsedData.filter(r => r._include)
    let success = 0
    let skipped = 0
    const errors = []

    for (const row of toImport) {
      try {
        const { error } = await supabase
          .from('profiles')
          .insert([{
            full_name: row.full_name,
            email: row.email,
            role: row.role,
            staff_type: row.staff_type,
            position_type: row.position_type,
            hire_date: row.hire_date,
            years_at_school: row.years_at_school,
            is_evaluator: row.is_evaluator,
            tenant_id: profile.tenant_id,
            is_active: true
          }])

        if (error) {
          if (error.message?.includes('duplicate') || error.message?.includes('unique')) {
            skipped++
            errors.push({ name: row.full_name, error: 'Already exists (duplicate email)' })
          } else {
            errors.push({ name: row.full_name, error: error.message })
          }
        } else {
          success++
        }
      } catch (err) {
        errors.push({ name: row.full_name, error: err.message })
      }
    }

    setImportResults({ success, skipped, errors })
    setStep(4)
  }

  const includedCount = parsedData.filter(r => r._include).length
  const duplicateCount = parsedData.filter(r => r._isDuplicate).length
  const missingEmailCount = parsedData.filter(r => r._isMissingEmail).length

  return (
    <div className="min-h-screen bg-gray-100">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold text-[#2c3e7e]">Import Staff from CSV</h2>
            <p className="text-[#666666] text-sm mt-1">
              Upload your staff CSV export to bulk-add staff members
            </p>
          </div>
          <a
            href="/staff"
            className="px-4 py-2 border border-gray-300 rounded-lg text-[#666666] hover:bg-gray-50"
          >
            ← Back to Staff
          </a>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center gap-2 mb-8">
          {[
            { num: 1, label: 'Upload CSV' },
            { num: 2, label: 'Review & Edit' },
            { num: 3, label: 'Importing' },
            { num: 4, label: 'Results' }
          ].map((s, i) => (
            <div key={s.num} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                step >= s.num ? 'bg-[#2c3e7e] text-white' : 'bg-gray-200 text-[#666666]'
              }`}>
                {step > s.num ? '✓' : s.num}
              </div>
              <span className={`text-sm ${step >= s.num ? 'text-[#2c3e7e] font-medium' : 'text-[#666666]'}`}>
                {s.label}
              </span>
              {i < 3 && <div className={`w-12 h-0.5 ${step > s.num ? 'bg-[#2c3e7e]' : 'bg-gray-200'}`} />}
            </div>
          ))}
        </div>

        {/* Step 1: Upload */}
        {step === 1 && (
          <div className="bg-white rounded-lg shadow p-8">
            <div className="max-w-xl mx-auto text-center">
              <div className="text-6xl mb-4">📄</div>
              <h3 className="text-xl font-bold text-[#2c3e7e] mb-2">Upload Staff CSV File</h3>
              <p className="text-[#666666] mb-6">
                Upload a CSV file with columns: full_name, position_type, email, hire_date, staff_type
              </p>

              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 hover:border-[#477fc1] transition-colors">
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="csv-upload"
                />
                <label
                  htmlFor="csv-upload"
                  className="cursor-pointer"
                >
                  <div className="text-4xl mb-2">⬆️</div>
                  <p className="text-[#2c3e7e] font-medium">Click to select CSV file</p>
                  <p className="text-sm text-[#666666] mt-1">or drag and drop</p>
                </label>
              </div>

              <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4 text-left">
                <h4 className="font-medium text-[#2c3e7e] mb-2">Expected CSV Format:</h4>
                <div className="text-sm text-[#666666] space-y-1">
                  <p><strong>full_name</strong> — "LAST, FIRST M" or "First Last" format</p>
                  <p><strong>position_type</strong> — Teacher, Case Manager, Counselor, Student Support, etc.</p>
                  <p><strong>email</strong> — Staff email address</p>
                  <p><strong>hire_date</strong> — M/DD/YY or YYYY-MM-DD format</p>
                  <p><strong>staff_type</strong> — Certified, Classified, or Confidential</p>
                </div>
                <p className="text-xs text-[#666666] mt-3">
                  Auto-handles: Name formatting, date conversion, staff type mapping, duplicate detection
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Preview */}
        {step === 2 && (
          <div>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-white p-4 rounded-lg shadow border-l-4 border-[#2c3e7e]">
                <p className="text-[#666666] text-sm">Total Rows</p>
                <p className="text-2xl font-bold text-[#2c3e7e]">{parsedData.length}</p>
              </div>
              <div className="bg-white p-4 rounded-lg shadow border-l-4 border-green-500">
                <p className="text-[#666666] text-sm">Ready to Import</p>
                <p className="text-2xl font-bold text-green-600">{includedCount}</p>
              </div>
              <div className="bg-white p-4 rounded-lg shadow border-l-4 border-yellow-500">
                <p className="text-[#666666] text-sm">Duplicates (will skip)</p>
                <p className="text-2xl font-bold text-yellow-600">{duplicateCount}</p>
              </div>
              <div className="bg-white p-4 rounded-lg shadow border-l-4 border-red-500">
                <p className="text-[#666666] text-sm">Missing Email</p>
                <p className="text-2xl font-bold text-red-600">{missingEmailCount}</p>
              </div>
            </div>

            {/* Warnings */}
            {(duplicateCount > 0 || missingEmailCount > 0) && (
              <div className="mb-4 space-y-2">
                {duplicateCount > 0 && (
                  <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-lg flex items-start gap-2">
                    <span>⚠️</span>
                    <p className="text-sm text-yellow-800">
                      <strong>{duplicateCount} duplicate(s)</strong> found — these staff already exist in StaffTrak and will be skipped.
                    </p>
                  </div>
                )}
                {missingEmailCount > 0 && (
                  <div className="bg-red-50 border border-red-200 p-3 rounded-lg flex items-start gap-2">
                    <span>🚫</span>
                    <p className="text-sm text-red-800">
                      <strong>{missingEmailCount} row(s)</strong> are missing email addresses and cannot be imported. Add emails to include them.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Preview Table */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="px-6 py-4 border-b flex justify-between items-center">
                <h3 className="font-bold text-[#2c3e7e]">Preview — {fileName}</h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setStep(1); setParsedData([]); setRawData([]); setFileName(''); }}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-[#666666] hover:bg-gray-50 text-sm"
                  >
                    Upload Different File
                  </button>
                  <button
                    onClick={handleImport}
                    disabled={includedCount === 0}
                    className="px-6 py-2 bg-[#2c3e7e] text-white rounded-lg hover:bg-[#1e2a5e] text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Import {includedCount} Staff Members
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-[#666666] uppercase">Include</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-[#666666] uppercase">Status</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-[#666666] uppercase">Name (Formatted)</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-[#666666] uppercase">Email</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-[#666666] uppercase">Position (Original → Mapped)</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-[#666666] uppercase">Type</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-[#666666] uppercase">Hire Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {parsedData.map((row, idx) => (
                      <tr 
                        key={idx} 
                        className={`${
                          row._isDuplicate ? 'bg-yellow-50' : 
                          row._isMissingEmail ? 'bg-red-50' : 
                          !row._include ? 'bg-gray-50 opacity-60' :
                          'hover:bg-gray-50'
                        }`}
                      >
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={row._include}
                            onChange={() => toggleInclude(idx)}
                            disabled={row._isMissingEmail}
                            className="w-4 h-4 text-[#2c3e7e] rounded"
                          />
                        </td>
                        <td className="px-3 py-2">
                          {row._isDuplicate && (
                            <span className="px-2 py-0.5 text-xs rounded bg-yellow-100 text-yellow-800">Duplicate</span>
                          )}
                          {row._isMissingEmail && (
                            <span className="px-2 py-0.5 text-xs rounded bg-red-100 text-red-800">No Email</span>
                          )}
                          {!row._isDuplicate && !row._isMissingEmail && (
                            <span className="px-2 py-0.5 text-xs rounded bg-green-100 text-green-800">Ready</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={row.full_name}
                            onChange={(e) => updateRow(idx, 'full_name', e.target.value)}
                            className="w-full px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-[#477fc1]"
                          />
                        </td>
                        <td className="px-3 py-2">
                          {row._isMissingEmail ? (
                            <input
                              type="email"
                              value={row.email}
                              onChange={(e) => {
                                const newEmail = e.target.value.trim().toLowerCase()
                                const isDup = existingEmails.includes(newEmail)
                                setParsedData(prev => prev.map((r, i) => 
                                  i === idx ? { ...r, email: newEmail, _isMissingEmail: !newEmail, _isDuplicate: isDup, _include: newEmail && !isDup } : r
                                ))
                              }}
                              placeholder="Enter email..."
                              className="w-full px-2 py-1 border border-red-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-red-400 bg-red-50"
                            />
                          ) : (
                            <span className="text-[#666666]">{row.email}</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            <span className="text-[#666666] text-xs">{row.original_position} →</span>
                            <select
                              value={row.position_type}
                              onChange={(e) => updateRow(idx, 'position_type', e.target.value)}
                              className="px-1 py-0.5 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-[#477fc1]"
                            >
                              <optgroup label="Licensed">
                                {['teacher', 'school_counselor', 'principal', 'assistant_principal', 'director', 'case_manager', 'special_education_director', 'curriculum_specialist', 'instructional_coach'].map(p => (
                                  <option key={p} value={p}>{p.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>
                                ))}
                              </optgroup>
                              <optgroup label="Classified">
                                {['advisor', 'student_support', 'paraprofessional', 'secretary', 'registrar', 'receptionist', 'office_manager', 'technology_lead', 'translator', 'community_partnerships', 'executive_assistant', 'bookkeeper'].map(p => (
                                  <option key={p} value={p}>{p.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>
                                ))}
                              </optgroup>
                            </select>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 text-xs rounded ${
                            row.staff_type === 'licensed' ? 'bg-[#477fc1] text-white' : 'bg-[#f3843e] text-white'
                          }`}>
                            {row.staff_type}
                          </span>
                          {row.original_staff_type?.toLowerCase() === 'confidential' && (
                            <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-gray-200 text-gray-600 rounded">conf.</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-[#666666]">
                          {row.hire_date || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Bottom action bar */}
              <div className="px-6 py-4 border-t bg-gray-50 flex justify-between items-center">
                <p className="text-sm text-[#666666]">
                  {includedCount} of {parsedData.length} rows will be imported
                </p>
                <button
                  onClick={handleImport}
                  disabled={includedCount === 0}
                  className="px-6 py-2 bg-[#2c3e7e] text-white rounded-lg hover:bg-[#1e2a5e] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Import {includedCount} Staff Members
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Importing */}
        {step === 3 && (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <div className="w-16 h-16 border-4 border-[#2c3e7e] border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
            <h3 className="text-xl font-bold text-[#2c3e7e] mb-2">Importing Staff Members...</h3>
            <p className="text-[#666666]">Please wait while we add {includedCount} staff members to StaffTrak.</p>
          </div>
        )}

        {/* Step 4: Results */}
        {step === 4 && (
          <div className="space-y-6">
            {/* Results Summary */}
            <div className="bg-white rounded-lg shadow p-8">
              <div className="text-center mb-6">
                <div className="text-6xl mb-4">
                  {importResults.errors.length === 0 ? '🎉' : '⚠️'}
                </div>
                <h3 className="text-2xl font-bold text-[#2c3e7e] mb-2">Import Complete</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-lg mx-auto">
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <p className="text-3xl font-bold text-green-600">{importResults.success}</p>
                  <p className="text-sm text-green-800">Imported</p>
                </div>
                <div className="text-center p-4 bg-yellow-50 rounded-lg">
                  <p className="text-3xl font-bold text-yellow-600">{importResults.skipped}</p>
                  <p className="text-sm text-yellow-800">Skipped</p>
                </div>
                <div className="text-center p-4 bg-red-50 rounded-lg">
                  <p className="text-3xl font-bold text-red-600">{importResults.errors.length - importResults.skipped}</p>
                  <p className="text-sm text-red-800">Errors</p>
                </div>
              </div>

              {/* Error Details */}
              {importResults.errors.length > 0 && (
                <div className="mt-6 bg-red-50 border border-red-200 rounded-lg p-4">
                  <h4 className="font-medium text-red-800 mb-2">Issues:</h4>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {importResults.errors.map((err, idx) => (
                      <p key={idx} className="text-sm text-red-700">
                        <strong>{err.name}:</strong> {err.error}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-center gap-4 mt-8">
                <button
                  onClick={() => navigate('/staff')}
                  className="px-6 py-3 bg-[#2c3e7e] text-white rounded-lg hover:bg-[#1e2a5e]"
                >
                  Go to Staff Directory
                </button>
                <button
                  onClick={() => { setStep(1); setParsedData([]); setRawData([]); setFileName(''); setImportResults({ success: 0, skipped: 0, errors: [] }); }}
                  className="px-6 py-3 border border-gray-300 rounded-lg text-[#666666] hover:bg-gray-50"
                >
                  Import Another File
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default StaffImport
