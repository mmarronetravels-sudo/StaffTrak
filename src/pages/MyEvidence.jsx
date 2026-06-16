import Navbar from '../components/Navbar'
import EvidenceBinder from '../components/EvidenceBinder'
import { useAuth } from '../context/AuthContext'

export default function MyEvidence() {
  const { profile } = useAuth()

  return (
    <div className="min-h-screen bg-gray-100">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <h2 className="text-2xl font-bold text-[#2c3e7e] mb-1">My Evidence</h2>
        <p className="text-[#666666] mb-6">
          Your body of evidence by rubric indicator. Add artifacts and links to document your practice.
        </p>
        {profile?.id ? (
          <EvidenceBinder staffId={profile.id} viewer={profile} canContribute={true} />
        ) : (
          <div className="bg-white p-8 rounded-lg shadow text-center text-[#666666]">Loading…</div>
        )}
      </main>
    </div>
  )
}
