import { Document, Page, Text, View, StyleSheet, PDFDownloadLink } from '@react-pdf/renderer'

// PDF Styles
const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 11,
    fontFamily: 'Helvetica',
  },
  header: {
    marginBottom: 20,
    borderBottom: '2 solid #2c3e7e',
    paddingBottom: 15,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2c3e7e',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 12,
    color: '#666666',
    marginBottom: 3,
  },
  schoolName: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  section: {
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#2c3e7e',
    marginBottom: 8,
    backgroundColor: '#f0f4f8',
    padding: 6,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  label: {
    width: '35%',
    color: '#666666',
  },
  value: {
    width: '65%',
    fontWeight: 'bold',
  },
  overallScore: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 15,
    padding: 15,
    backgroundColor: '#f0f4f8',
    borderRadius: 5,
  },
  scoreNumber: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#2c3e7e',
    marginRight: 15,
  },
  scoreRating: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  domainRow: {
    flexDirection: 'row',
    borderBottom: '1 solid #e0e0e0',
    paddingVertical: 8,
  },
  domainName: {
    width: '70%',
  },
  domainScore: {
    width: '15%',
    textAlign: 'center',
    fontWeight: 'bold',
  },
  domainRating: {
    width: '15%',
    textAlign: 'right',
    fontSize: 9,
  },
  feedbackBox: {
    backgroundColor: '#f9f9f9',
    padding: 10,
    marginBottom: 10,
    borderLeft: '3 solid #2c3e7e',
  },
  feedbackLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#2c3e7e',
    marginBottom: 4,
  },
  feedbackText: {
    fontSize: 10,
    color: '#333333',
    lineHeight: 1.4,
  },
  signatureSection: {
    marginTop: 20,
    borderTop: '1 solid #cccccc',
    paddingTop: 15,
  },
  signatureRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  signatureLabel: {
    width: '25%',
    color: '#666666',
  },
  signatureValue: {
    width: '40%',
  },
  signatureDate: {
    width: '35%',
    textAlign: 'right',
    fontSize: 9,
    color: '#666666',
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: 'center',
    color: '#999999',
    fontSize: 9,
    borderTop: '1 solid #e0e0e0',
    paddingTop: 10,
  },
  staffComments: {
    backgroundColor: '#fff8e6',
    padding: 10,
    marginTop: 10,
    borderLeft: '3 solid #f3843e',
  },
})

// Helper function to get rating from score
const getRating = (score) => {
  if (!score) return 'N/A'
  const s = parseFloat(score)
  if (s >= 3.5) return 'Highly Effective'
  if (s >= 2.5) return 'Effective'
  if (s >= 1.5) return 'Developing'
  return 'Needs Improvement'
}

// Helper to format date
const formatDate = (dateStr) => {
  if (!dateStr) return 'Not signed'
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  })
}

// The PDF Document component
const SummativePDFDocument = ({ evaluation, staff, evaluator, domains, schoolName }) => (
  <Document>
    <Page size="LETTER" style={styles.page}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.schoolName}>{schoolName || 'StaffTrak'}</Text>
        <Text style={styles.title}>Summative Evaluation</Text>
        <Text style={styles.subtitle}>School Year 2025-2026</Text>
      </View>

      {/* Employee Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Employee Information</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Employee Name:</Text>
          <Text style={styles.value}>{staff?.full_name || 'N/A'}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Position:</Text>
          <Text style={styles.value}>{staff?.position_type || 'N/A'}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Staff Type:</Text>
          <Text style={styles.value}>{staff?.staff_type || 'N/A'}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Evaluator:</Text>
          <Text style={styles.value}>{evaluator?.full_name || 'N/A'}</Text>
        </View>
      </View>

      {/* Overall Score */}
      <View style={styles.overallScore}>
        <Text style={styles.scoreNumber}>{evaluation?.overall_score || 'N/A'}</Text>
        <View>
          <Text style={styles.scoreRating}>{evaluation?.overall_rating || 'N/A'}</Text>
          <Text style={{ fontSize: 9, color: '#666666' }}>Overall Rating</Text>
        </View>
      </View>

      {/* Domain Scores */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Domain Scores</Text>
        {domains && domains.map((domain) => {
          const domainData = evaluation?.domain_scores?.[domain.id]
          return (
            <View key={domain.id}>
              <View style={styles.domainRow}>
                <Text style={styles.domainName}>{domain.name}</Text>
                <Text style={styles.domainScore}>{domainData?.score || '-'}</Text>
                <Text style={styles.domainRating}>{getRating(domainData?.score)}</Text>
              </View>
              {domainData?.feedback && (
                <View style={{ paddingLeft: 10, paddingBottom: 5 }}>
                  <Text style={{ fontSize: 9, color: '#666666', fontStyle: 'italic' }}>
                    {domainData.feedback}
                  </Text>
                </View>
              )}
            </View>
          )
        })}
      </View>

      {/* Narrative Feedback */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Evaluator Feedback</Text>
        
        {evaluation?.areas_of_strength && (
          <View style={styles.feedbackBox}>
            <Text style={styles.feedbackLabel}>Areas of Strength</Text>
            <Text style={styles.feedbackText}>{evaluation.areas_of_strength}</Text>
          </View>
        )}
        
        {evaluation?.areas_for_growth && (
          <View style={styles.feedbackBox}>
            <Text style={styles.feedbackLabel}>Areas for Growth</Text>
            <Text style={styles.feedbackText}>{evaluation.areas_for_growth}</Text>
          </View>
        )}
        
        {evaluation?.recommended_support && (
          <View style={styles.feedbackBox}>
            <Text style={styles.feedbackLabel}>Recommended Support</Text>
            <Text style={styles.feedbackText}>{evaluation.recommended_support}</Text>
          </View>
        )}
        
        {evaluation?.additional_comments && (
          <View style={styles.feedbackBox}>
            <Text style={styles.feedbackLabel}>Additional Comments</Text>
            <Text style={styles.feedbackText}>{evaluation.additional_comments}</Text>
          </View>
        )}
      </View>

      {/* Staff Comments */}
      {evaluation?.staff_comments && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Employee Comments</Text>
          <View style={styles.staffComments}>
            <Text style={styles.feedbackText}>{evaluation.staff_comments}</Text>
          </View>
        </View>
      )}

      {/* Signatures */}
      <View style={styles.signatureSection}>
        <Text style={[styles.sectionTitle, { marginBottom: 15 }]}>Signatures</Text>
        
        <View style={styles.signatureRow}>
          <Text style={styles.signatureLabel}>Evaluator:</Text>
          <Text style={styles.signatureValue}>{evaluator?.full_name || 'N/A'}</Text>
          <Text style={styles.signatureDate}>
            {evaluation?.evaluator_signature_at 
              ? `Signed: ${formatDate(evaluation.evaluator_signature_at)}`
              : 'Not signed'}
          </Text>
        </View>
        
        <View style={styles.signatureRow}>
          <Text style={styles.signatureLabel}>Employee:</Text>
          <Text style={styles.signatureValue}>{staff?.full_name || 'N/A'}</Text>
          <Text style={styles.signatureDate}>
            {evaluation?.staff_signature_at 
              ? `Signed: ${formatDate(evaluation.staff_signature_at)}`
              : 'Not signed'}
          </Text>
        </View>

        <View style={{ marginTop: 10 }}>
          <Text style={{ fontSize: 9, color: '#666666', fontStyle: 'italic' }}>
            Employee signature acknowledges receipt and review of this evaluation. 
            It does not necessarily indicate agreement with the evaluation.
          </Text>
        </View>
      </View>

      {/* Footer */}
      <Text style={styles.footer}>
        Generated by StaffTrak • {new Date().toLocaleDateString()} • ScholarPath Systems
      </Text>
    </Page>
  </Document>
)

// Export component with download button
export function SummativePDFDownload({ evaluation, staff, evaluator, domains, schoolName }) {
  const fileName = `Summative_Evaluation_${staff?.full_name?.replace(/\s+/g, '_') || 'Staff'}_${new Date().getFullYear()}.pdf`
  
  return (
    <PDFDownloadLink
      document={
        <SummativePDFDocument 
          evaluation={evaluation}
          staff={staff}
          evaluator={evaluator}
          domains={domains}
          schoolName={schoolName}
        />
      }
      fileName={fileName}
      className="inline-flex items-center gap-2 px-4 py-2 bg-[#477fc1] text-white rounded-lg hover:bg-[#3a6ca8] transition-colors"
    >
      {({ loading }) => (
        loading ? 'Generating PDF...' : '📄 Download PDF'
      )}
    </PDFDownloadLink>
  )
}

export default SummativePDFDocument