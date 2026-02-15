import express from 'express'
import { supabase } from '../config/supabase'

const router = express.Router()

// Test connection
 router.get('/test-supabase', async (req, res) => {
     try {
       const { data, error } = await supabase
         .from('_test')
         .select('*')
         .limit(1)

       if (error && error.message.includes('relation')) {
         return res.json({ 
           status: 'connected', 
           message: 'Supabase connected' 
         })
       }

       res.json({ status: 'connected', data })
     } catch (err) {
       res.status(500).json({ 
         status: 'error', 
         message: 'Connection Error',
         error: String(err)
       })
     }
   })

  // CREATE 
router.post('/test-insert', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('companies')
      .insert([
        { 
          name: 'Test Company',
          date: new Date().toISOString().split('T')[0] 
        }
      ])
      .select()

    if (error) {
      console.error('Supabase error:', error)
      return res.status(400).json({ 
        status: 'error', 
        message: error.message
      })
    }

    res.status(201).json({ 
      status: 'success', 
      message: 'Company created successfully',
      data 
    })
  } catch (err) {
    console.error('Caught error:', err)
    res.status(500).json({ 
      status: 'error', 
      message: String(err) 
    })
  }
})
// READ
router.get('/test-companies', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .order('date', { ascending: false })

    if (error) {
      return res.status(400).json({ 
        status: 'error', 
        message: error.message 
      })
    }

    res.json({ 
      status: 'success', 
      count: data.length,
      data 
    })
  } catch (err) {
    res.status(500).json({ 
      status: 'error', 
      message: String(err) 
    })
  }
})


   export default router