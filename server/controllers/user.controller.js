const supabase = require('../config/supabaseClient');
const bcrypt = require('bcryptjs');

// Admin gets all pending user requests
exports.getPendingUsers = async (req, res) => {
    const { data, error } = await supabase
        .from('users')
        .select('id, email, company_name, role, created_at, full_name, avatar_url')
        .eq('is_approved', false);

    if (error) {
        return res.status(500).json({ error: error.message });
    }
    res.json(data);
};

// Admin gets all approved users (for access logs)
exports.getApprovedUsers = async (req, res) => {
    const { data, error } = await supabase
        .from('users')
        .select('id, email, company_name, role, created_at, full_name, avatar_url')
        .eq('is_approved', true)
        .order('created_at', { ascending: false });

    if (error) {
        return res.status(500).json({ error: error.message });
    }
    res.json(data);
};

// Admin approves a user
exports.approveUser = async (req, res) => {
    const { userId } = req.params;
    const { data, error } = await supabase
        .from('users')
        .update({ is_approved: true })
        .eq('id', userId)
        .select();

    if (error) {
        return res.status(500).json({ error: error.message });
    }
    if (data.length === 0) {
        return res.status(404).json({ error: 'User not found.' });
    }

    res.json({ message: 'User approved successfully.', user: data[0] });
};

// Admin rejects/deletes a user request
exports.rejectUser = async (req, res) => {
    const { userId } = req.params;
    const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', userId);

    if (error) {
        return res.status(500).json({ error: error.message });
    }

    res.json({ message: 'User request rejected and deleted successfully.' });
};

// Logged-in user updates their own profile
exports.updateProfile = async (req, res) => {
    const userId = req.user.id;
    const { full_name, avatar_url } = req.body;
    const updates = {};
    if (full_name !== undefined) updates.full_name = full_name;
    if (avatar_url !== undefined) updates.avatar_url = avatar_url;

    const { data, error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', userId)
        .select('id, email, full_name, avatar_url, role, company_name');

    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: 'Profile updated.', user: data[0] });
};

// Logged-in user changes their password
exports.updatePassword = async (req, res) => {
    const userId = req.user.id;
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
        return res.status(400).json({ error: 'Both current and new password are required.' });
    }
    if (new_password.length < 8) {
        return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    }

    const { data: user, error } = await supabase
        .from('users')
        .select('password_hash')
        .eq('id', userId)
        .single();

    if (error || !user) return res.status(404).json({ error: 'User not found.' });

    const match = await bcrypt.compare(current_password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Current password is incorrect.' });

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(new_password, salt);

    const { error: updateError } = await supabase
        .from('users')
        .update({ password_hash })
        .eq('id', userId);

    if (updateError) return res.status(500).json({ error: updateError.message });
    res.json({ message: 'Password changed successfully.' });
};