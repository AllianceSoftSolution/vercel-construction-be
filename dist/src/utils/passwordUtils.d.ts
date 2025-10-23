export declare const validatePasswordStrength: (password: string) => {
    isValid: boolean;
    errors: string[];
};
export declare const validatePassword: (password: string) => boolean;
export declare const generateSecurePassword: (length?: number) => string;
