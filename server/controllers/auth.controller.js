const supabase = require('../config/supabaseClient');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

exports.signup = async (req, res) => {
    const { email, password, companyName, role } = req.body;

    if (!email || !password || !role) {
        return res.status(400).json({ error: 'Email, password, and role are required fields.' });
    }

    // Hash the password for security
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    // As per requirement: First admin is auto-approved.
    const is_approved = role === 'admin';

    const { data, error } = await supabase
        .from('users')
        .insert([{ email, password_hash, company_name: companyName, role, is_approved }])
        .select();

    if (error) {
        // Check for unique constraint violation (email already exists)
        if (error.code === '23505') {
            return res.status(409).json({ error: 'User with this email already exists.' });
        }
        return res.status(500).json({ error: error.message });
    }

    res.status(201).json({ 
        message: 'Registration successful. Awaiting admin approval.', 
        user: data[0] 
    });
};

exports.login = async (req, res) => {
    const { email, password, role } = req.body;

    const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .single();

    if (error || !user) {
        return res.status(404).json({ error: 'User not found.' });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
        return res.status(401).json({ error: 'Invalid credentials.' });
    }
    
    // Verify role
    if (user.role !== role) {
        return res.status(403).json({ error: `Access denied. You are not registered as a(n) ${role}.`});
    }

    // Verify approval status
    if (!user.is_approved) {
        return res.status(403).json({ error: 'Your account is pending approval by a Fleet Admin.' });
    }

    // Create and sign JWT — include full_name so client-side guards can display immediately
    const payload = {
        id: user.id,
        role: user.role,
        email: user.email,
        full_name: user.full_name || ''
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '8h' });

    res.json({
        message: 'Login successful.',
        token,
        user: {
            id: user.id,
            email: user.email,
            role: user.role,
            full_name: user.full_name || ''
        }
    });
};