// src/services/emailService.js
import { supabase } from '../supabaseClient'

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email`

async function sendEmail(to, template, data) {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    
    const response = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ to, template, data }),
    })

    const result = await response.json()
    return result
  } catch (error) {
    console.error('Email service error:', error)
    return { success: false, error: error.message }
  }
}

// Goal notifications
export const notifyGoalSubmitted = ({ evaluatorEmail, staffName, goalTitle, goalType }) =>
  sendEmail(evaluatorEmail, 'goal_submitted', { staffName, goalTitle, goalType })

export const notifyGoalApproved = ({ staffEmail, staffName, goalTitle, evaluatorName }) =>
  sendEmail(staffEmail, 'goal_approved', { staffName, goalTitle, evaluatorName })

export const notifyGoalRevision = ({ staffEmail, staffName, goalTitle, evaluatorName, feedback }) =>
  sendEmail(staffEmail, 'goal_revision', { staffName, goalTitle, evaluatorName, feedback })

// Observation notifications  
export const notifyObservationScheduled = ({ staffEmail, staffName, evaluatorName, date, time, type }) =>
  sendEmail(staffEmail, 'observation_scheduled', { staffName, evaluatorName, date, time, type })

// Evaluation notifications
export const notifyEvaluationReady = ({ staffEmail, staffName, evaluatorName, schoolYear }) =>
  sendEmail(staffEmail, 'evaluation_ready', { staffName, evaluatorName, schoolYear })