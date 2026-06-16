import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import Navbar from '../components/Navbar'
import EvaluationChecklist from '../components/EvaluationChecklist'
import { reconcileCycleTasks } from '../lib/reconcileCycleTasks'

export default function MyChecklist() {
  const { profile, isAdmin, isEvaluator, isHR } = useAuth()
  const [cycle, setCycle] = useState(null)
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (profile?.id) load()
  }, [profile])

  const load = async () => {
    setLoading(true)

    // Most recent cycle where I'm the staff member.
    const { data: cycles } = await supabase
      .from('evaluation_cycles')
      .select('*, staff:staff_id(id, full_name), evaluator:evaluator_id(id, full_name)')
      .eq('staff_id', profile.id)
      .order('school_year', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)

    const current = cycles?.[0] || null
    setCycle(current)

    if (current) {
      const { data: rows } = await supabase
        .from('cycle_tasks')
        .select('*')
        .eq('cycle_id', current.id)
        .order('sort_order', { ascending: true })

      let list = rows || []
      // Auto-check anything already finished in the underlying pages.
      list = await reconcileCycleTasks(current, list, profile.id)
      setTasks(list)
    } else {
      setTasks([])
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <h2 className="text-2xl font-bold text-[#2c3e7e] mb-1">My Evaluation Checklist</h2>
        <p className="text-[#666666] mb-6">Your tasks and deadlines for the evaluation cycle.</p>

        {loading ? (
          <div className="text-center py-12">
            <div className="w-12 h-12 border-4 border-[#2c3e7e] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-[#666666]">Loading...</p>
          </div>
        ) : !cycle ? (
          <div className="bg-white p-8 rounded-lg shadow text-center text-[#666666]">
            You don’t have an evaluation cycle yet. Your HR team will start one for this school year.
          </div>
        ) : (
          <EvaluationChecklist
            cycle={cycle}
            tasks={tasks}
            profile={profile}
            isAdmin={isAdmin}
            isEvaluator={isEvaluator}
            isHR={isHR}
            onTasksChange={setTasks}
          />
        )}
      </main>
    </div>
  )
}
