import { useState, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import Navbar from '../components/Navbar'

export default function StaffImport() {
  const { user } = useAuth()
  const fileInputRef = useRef(null)
  
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState([])
  const [headers, setHeaders] = useState([])
  const [mapping, setMapping] = useState({})
  const [importing, setImporting] = useState(false)
  const [results, setResults] = useState(null)
  const [step, setStep] = useState(1) // 1: Upload, 2: Map Fields, 3: Preview, 4: Results

  // Required fields for staff import
  const requiredFields = [
    { key: 'email', label: 'Email', required: true },
    { key: 'full_name', label: 'Full Name', required: true },
    { key: 'role', label: 'Role', required: true },
    { key: 'position_type', label: 'Position Type', required: false },
    { key: 'staff_type', label: 'Staff Type (licensed/classified)', required: false },
    { key: 'hire_date', label: 'Hire Date', required: false },
    { key: 'evaluator_email', label: 'Evaluator Email', required: false },
  ]

  // Parse CSV file
  const parseCSV = (text) => {
    const lines = text.split('\n').filter(line => line.trim())
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))
    const rows = lines.slice(1).map(line => {
      const values = []
      let current = ''
      let inQuotes = false
      
      for (let char of line) {
        if (char === '"') {
          inQuotes = !inQuotes
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim())
          current = ''
        } else {
          current += char
        }
      }
      values.push(current.trim())
      
      const row = {}
      headers.forEach((header, i) => {
        row[header] = values[i] || ''
      })
      return row
    })
    
    return { headers, rows }
  }

  // Handle file selection
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0]
    if (!selectedFile) return

    if (!selectedFile.name.endsWith('.csv')) {
      alert('Please select a CSV file')
      return
    }

    setFile(selectedFile)
    
    const reader = new FileReader()
    reader.onload = (event) => {
      const { headers, rows } = parseCSV(event.target.result)
      setHeaders(headers)
      setPreview(rows)
      
      // Auto-map fields based on header names
      const autoMapping = {}
      requiredFields.forEach(field => {
        const match = headers.find(h => 
          h.toLowerCase().replace(/[_\s]/g, '') === 
          field.key.toLowerCase().replace(/[_\s]/g, '') ||
          h.toLowerCase().includes(field.key.toLowerCase())
        )
        if (match) {
          autoMapping[field.key] = match
        }
      })
      setMapping(autoMapping)
      setStep(2)
    }
    reader.readAsText(selectedFile)
  }

  // Handle field mapping change
  const handleMappingChange = (fieldKey, csvHeader) => {
    setMapping(prev => ({
      ...prev,
      [fieldKey]: csvHeader
    }))
  }

  // Validate mapping
  const validateMapping = () => {
    const missingRequired = requiredFields
      .filter(f => f.required && !mapping[f.key])
      .map(f => f.label)
    
    if (missingRequired.length > 0) {
      alert(`Missing required field mappings: ${missingRequired.join(', ')}`)
      return false
    }
    return true
  }

  // Proceed to preview
  const handleProceedToPreview = () => {
    if (validateMapping()) {
      setStep(3)
    }
  }

  // Transform row data based on mapping
  const transformRow = (row) => {
    const transformed = {}
    Object.entries(mapping).forEach(([fieldKey, csvHeader]) => {
      if (csvHeader && row[csvHeader]) {
        transformed[fieldKey] = row[csvHeader]
      }
    })
    return transformed
  }

  // Import staff
  const handleImport = async () => {
    setImporting(true)
    setResults(null)

    const imported = []
    const errors = []
    const skipped = []

    // Get tenant_id from current user
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single()

    if (!userProfile) {
      alert('Could not determine tenant')
      setImporting(false)
      return
    }

    // Get all existing evaluators for mapping
    const { data: evaluators } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('tenant_id', userProfile.tenant_id)
      .in('role', ['district_admin', 'school_admin', 'evaluator'])

    const evaluatorMap = {}
    evaluators?.forEach(e => {
      evaluatorMap[e.email.toLowerCase()] = e.id
    })

    // Process each row
    for (let i = 0; i < preview.length; i++) {
      const row = preview[i]
      const data = transformRow(row)
      
      // Skip empty rows
      if (!data.email || !data.full_name) {
        skipped.push({ row: i + 2, reason: 'Missing email or name' })
        continue
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(data.email)) {
        errors.push({ row: i + 2, email: data.email, reason: 'Invalid email format' })
        continue
      }

      // Check if user already exists
      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', data.email.toLowerCase())
        .single()

      if (existing) {
        skipped.push({ row: i + 2, email: data.email, reason: 'User already exists' })
        continue
      }

      // Determine staff_type from role if not provided
      let staffType = data.staff_type?.toLowerCase()
      if (!staffType) {
        const licensedRoles = ['licensed_staff', 'teacher', 'counselor', 'administrator']
        const role = data.role?.toLowerCase()
        staffType = licensedRoles.includes(role) ? 'licensed' : 'classified'
      }

      // Map evaluator email to ID
      let evaluatorId = null
      if (data.evaluator_email) {
        evaluatorId = evaluatorMap[data.evaluator_email.toLowerCase()] || null
      }

      // Create auth user first
      const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
        email: data.email.toLowerCase(),
        email_confirm: true,
        password: generateTempPassword(),
        user_metadata: {
          full_name: data.full_name
        }
      })

      if (authError) {
        // If we can't create auth user via admin API, try inviting
        const { error: inviteError } = await supabase.auth.signInWithOtp({
          email: data.email.toLowerCase(),
          options: {
            data: { full_name: data.full_name }
          }
        })
        
        if (inviteError) {
          errors.push({ row: i + 2, email: data.email, reason: inviteError.message })
          continue
        }
      }

      // Create profile
      const profileData = {
        id: authUser?.user?.id,
        tenant_id: userProfile.tenant_id,
        email: data.email.toLowerCase(),
        full_name: data.full_name,
        role: normalizeRole(data.role),
        position_type: data.position_type || null,
        staff_type: staffType,
        hire_date: data.hire_date ? new Date(data.hire_date).toISOString().split('T')[0] : null,
        evaluator_id: evaluatorId,
        is_active: true
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .insert(profileData)

      if (profileError) {
        errors.push({ row: i + 2, email: data.email, reason: profileError.message })
      } else {
        imported.push({ row: i + 2, email: data.email, name: data.full_name })
      }
    }

    setResults({ imported, errors, skipped })
    setStep(4)
    setImporting(false)
  }

  // Helper: Normalize role value
  const normalizeRole = (role) => {
    const roleMap = {
      'admin': 'school_admin',
      'administrator': 'school_admin',
      'principal': 'school_admin',
      'teacher': 'licensed_staff',
      'counselor': 'licensed_staff',
      'staff': 'classified_staff',
      'classified': 'classified_staff',
      'licensed': 'licensed_staff'
    }
    const normalized = role?.toLowerCase().trim()
    return roleMap[normalized] || normalized || 'licensed_staff'
  }

  // Helper: Generate temporary password
  const generateTempPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%'
    let password = ''
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return password
  }

  // Reset import
  const handleReset = () => {
    setFile(null)
    setPreview([])
    setHeaders([])
    setMapping({})
    setResults(null)
    setStep(1)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Download sample CSV
  const downloadSampleCSV = () => {
    const sample = `email,full_name,role,position_type,staff_type,hire_date,evaluator_email
john.smith@school.org,John Smith,licensed_staff,Teacher,licensed,2023-08-15,principal@school.org
jane.doe@school.org,Jane Doe,licensed_staff,Counselor,licensed,2022-01-10,principal@school.org
bob.wilson@school.org,Bob Wilson,classified_staff,Secretary,classified,2021-06-01,principal@school.org`
    
    const blob = new Blob([sample], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'staff_import_template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <Navbar />
      
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Import Staff from CSV</h1>
          <p className="text-gray-600 mt-1">
            Upload a CSV file to bulk import staff members into StaffTrak
          </p>
        </div>

        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-between max-w-2xl">
            {['Upload', 'Map Fields', 'Preview', 'Results'].map((label, idx) => (
              <div key={label} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
                  ${step > idx + 1 ? 'bg-green-500 text-white' : 
                    step === idx + 1 ? 'bg-[#2c3e7e] text-white' : 
                    'bg-gray-200 text-gray-600'}`}>
                  {step > idx + 1 ? '✓' : idx + 1}
                </div>
                <span className={`ml-2 text-sm ${step === idx + 1 ? 'font-medium' : 'text-gray-500'}`}>
                  {label}
                </span>
                {idx < 3 && (
                  <div className={`w-12 h-0.5 mx-4 ${step > idx + 1 ? 'bg-green-500' : 'bg-gray-200'}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Step 1: Upload */}
        {step === 1 && (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="mb-4">
              <button
                onClick={downloadSampleCSV}
                className="text-[#477fc1] hover:underline text-sm"
              >
                ↓ Download sample CSV template
              </button>
            </div>

            <div 
              className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center hover:border-[#477fc1] transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="text-gray-400 mb-4">
                <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <p className="text-lg font-medium text-gray-700">
                Drop your CSV file here or click to browse
              </p>
              <p className="text-sm text-gray-500 mt-2">
                Supports .csv files with staff information
              </p>
            </div>

            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <h3 className="font-medium text-blue-900 mb-2">Required columns:</h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• <strong>email</strong> - Staff email address</li>
                <li>• <strong>full_name</strong> - Staff full name</li>
                <li>• <strong>role</strong> - User role (licensed_staff, classified_staff, evaluator, etc.)</li>
              </ul>
              <h3 className="font-medium text-blue-900 mt-4 mb-2">Optional columns:</h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• <strong>position_type</strong> - Teacher, Counselor, Secretary, etc.</li>
                <li>• <strong>staff_type</strong> - licensed or classified</li>
                <li>• <strong>hire_date</strong> - Date hired (YYYY-MM-DD format)</li>
                <li>• <strong>evaluator_email</strong> - Email of assigned evaluator</li>
              </ul>
            </div>
          </div>
        )}

        {/* Step 2: Map Fields */}
        {step === 2 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Map CSV Columns to Staff Fields</h2>
            <p className="text-gray-600 mb-6">
              Match your CSV columns to the corresponding StaffTrak fields
            </p>

            <div className="space-y-4">
              {requiredFields.map(field => (
                <div key={field.key} className="flex items-center gap-4">
                  <div className="w-48">
                    <span className={`${field.required ? 'font-medium' : ''}`}>
                      {field.label}
                      {field.required && <span className="text-red-500 ml-1">*</span>}
                    </span>
                  </div>
                  <select
                    value={mapping[field.key] || ''}
                    onChange={(e) => handleMappingChange(field.key, e.target.value)}
                    className="flex-1 border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                  >
                    <option value="">-- Select CSV column --</option>
                    {headers.map(header => (
                      <option key={header} value={header}>{header}</option>
                    ))}
                  </select>
                  {mapping[field.key] && (
                    <span className="text-green-500">✓</span>
                  )}
                </div>
              ))}
            </div>

            <div className="flex gap-3 mt-8">
              <button
                onClick={handleReset}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                ← Back
              </button>
              <button
                onClick={handleProceedToPreview}
                className="px-6 py-2 bg-[#2c3e7e] text-white rounded hover:bg-[#1e2d5b]"
              >
                Preview Import →
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Preview */}
        {step === 3 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Preview Import</h2>
            <p className="text-gray-600 mb-6">
              Review the data before importing. Showing first 10 rows of {preview.length} total.
            </p>

            <div className="overflow-x-auto">
              <table className="min-w-full border border-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Row</th>
                    {requiredFields.filter(f => mapping[f.key]).map(field => (
                      <th key={field.key} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        {field.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {preview.slice(0, 10).map((row, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-4 py-2 text-sm text-gray-500">{idx + 2}</td>
                      {requiredFields.filter(f => mapping[f.key]).map(field => (
                        <td key={field.key} className="px-4 py-2 text-sm">
                          {row[mapping[field.key]] || '-'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {preview.length > 10 && (
              <p className="text-sm text-gray-500 mt-4">
                ... and {preview.length - 10} more rows
              </p>
            )}

            <div className="flex gap-3 mt-8">
              <button
                onClick={() => setStep(2)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                ← Back
              </button>
              <button
                onClick={handleImport}
                disabled={importing}
                className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
              >
                {importing ? 'Importing...' : `Import ${preview.length} Staff Members`}
              </button>
            </div>

            {importing && (
              <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="animate-spin w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                  <span className="text-blue-800">Processing import... Please wait.</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 4: Results */}
        {step === 4 && results && (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="text-3xl font-bold text-green-600">{results.imported.length}</div>
                <div className="text-green-800">Successfully Imported</div>
              </div>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="text-3xl font-bold text-yellow-600">{results.skipped.length}</div>
                <div className="text-yellow-800">Skipped</div>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="text-3xl font-bold text-red-600">{results.errors.length}</div>
                <div className="text-red-800">Errors</div>
              </div>
            </div>

            {/* Imported */}
            {results.imported.length > 0 && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="font-semibold text-green-700 mb-3">✓ Successfully Imported</h3>
                <div className="max-h-48 overflow-y-auto">
                  <ul className="text-sm space-y-1">
                    {results.imported.map((item, idx) => (
                      <li key={idx} className="text-gray-700">
                        Row {item.row}: {item.name} ({item.email})
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Skipped */}
            {results.skipped.length > 0 && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="font-semibold text-yellow-700 mb-3">⚠ Skipped</h3>
                <div className="max-h-48 overflow-y-auto">
                  <ul className="text-sm space-y-1">
                    {results.skipped.map((item, idx) => (
                      <li key={idx} className="text-gray-700">
                        Row {item.row}: {item.email || 'No email'} - {item.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Errors */}
            {results.errors.length > 0 && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="font-semibold text-red-700 mb-3">✗ Errors</h3>
                <div className="max-h-48 overflow-y-auto">
                  <ul className="text-sm space-y-1">
                    {results.errors.map((item, idx) => (
                      <li key={idx} className="text-red-700">
                        Row {item.row}: {item.email} - {item.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleReset}
                className="px-6 py-2 bg-[#2c3e7e] text-white rounded hover:bg-[#1e2d5b]"
              >
                Import More Staff
              </button>
              <a
                href="/staff"
                className="px-6 py-2 border border-gray-300 rounded hover:bg-gray-50"
              >
                View Staff List
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
