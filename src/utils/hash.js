// utils/hash.js
import bcrypt from "bcrypt";  

export async function hashPassword(password) {
    try {
        return await bcrypt.hash(password, 10);  // 
    } catch (err) {
        console.error("Hashing error:", err.message);
        throw new Error("Failed to hash password");
    }
}

export async function comparePassword(password, hashedPassword) {
    try {
        return await bcrypt.compare(password, hashedPassword);  // 
    } catch (err) {
        console.error("Comparison error:", err.message);
        throw new Error("Password comparison failed");
    }
}