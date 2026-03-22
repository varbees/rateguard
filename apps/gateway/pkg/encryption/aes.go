package encryption

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
)

var (
	ErrInvalidKey        = errors.New("invalid encryption key: must be 32 bytes")
	ErrInvalidCiphertext = errors.New("invalid ciphertext: too short")
	ErrDecryptionFailed  = errors.New("decryption failed")
)

// AESEncryptor handles AES-256-GCM encryption and decryption
type AESEncryptor struct {
	key []byte
}

// NewAESEncryptor creates a new AES encryptor with a 32-byte key
func NewAESEncryptor(key []byte) (*AESEncryptor, error) {
	if len(key) != 32 {
		return nil, ErrInvalidKey
	}
	return &AESEncryptor{key: key}, nil
}

// Encrypt encrypts plaintext using AES-256-GCM
// Returns base64-encoded ciphertext
func (e *AESEncryptor) Encrypt(plaintext []byte) (string, error) {
	block, err := aes.NewCipher(e.key)
	if err != nil {
		return "", fmt.Errorf("failed to create cipher: %w", err)
	}

	// Create GCM mode
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("failed to create GCM: %w", err)
	}

	// Generate a random nonce
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("failed to generate nonce: %w", err)
	}

	// Encrypt the data
	// Format: nonce + ciphertext + tag
	ciphertext := gcm.Seal(nonce, nonce, plaintext, nil)

	// Encode to base64 for safe storage
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

// Decrypt decrypts base64-encoded ciphertext using AES-256-GCM
// Returns original plaintext
func (e *AESEncryptor) Decrypt(ciphertextBase64 string) ([]byte, error) {
	// Decode from base64
	ciphertext, err := base64.StdEncoding.DecodeString(ciphertextBase64)
	if err != nil {
		return nil, fmt.Errorf("failed to decode base64: %w", err)
	}

	block, err := aes.NewCipher(e.key)
	if err != nil {
		return nil, fmt.Errorf("failed to create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("failed to create GCM: %w", err)
	}

	nonceSize := gcm.NonceSize()
	if len(ciphertext) < nonceSize {
		return nil, ErrInvalidCiphertext
	}

	// Extract nonce and ciphertext
	nonce, ciphertext := ciphertext[:nonceSize], ciphertext[nonceSize:]

	// Decrypt
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return nil, ErrDecryptionFailed
	}

	return plaintext, nil
}

// EncryptString encrypts a string and returns base64-encoded ciphertext
func (e *AESEncryptor) EncryptString(plaintext string) (string, error) {
	return e.Encrypt([]byte(plaintext))
}

// DecryptString decrypts base64-encoded ciphertext and returns the original string
func (e *AESEncryptor) DecryptString(ciphertextBase64 string) (string, error) {
	plaintext, err := e.Decrypt(ciphertextBase64)
	if err != nil {
		return "", err
	}
	return string(plaintext), nil
}

// EncryptMap encrypts all values in a map[string]string
// Keys remain plaintext, values are encrypted
func (e *AESEncryptor) EncryptMap(data map[string]string) (map[string]string, error) {
	encrypted := make(map[string]string, len(data))
	for key, value := range data {
		encryptedValue, err := e.EncryptString(value)
		if err != nil {
			return nil, fmt.Errorf("failed to encrypt value for key %s: %w", key, err)
		}
		encrypted[key] = encryptedValue
	}
	return encrypted, nil
}

// DecryptMap decrypts all values in a map[string]string
// Keys remain plaintext, values are decrypted
func (e *AESEncryptor) DecryptMap(data map[string]string) (map[string]string, error) {
	decrypted := make(map[string]string, len(data))
	for key, value := range data {
		decryptedValue, err := e.DecryptString(value)
		if err != nil {
			return nil, fmt.Errorf("failed to decrypt value for key %s: %w", key, err)
		}
		decrypted[key] = decryptedValue
	}
	return decrypted, nil
}

// GenerateKey generates a random 32-byte key for AES-256
func GenerateKey() ([]byte, error) {
	key := make([]byte, 32)
	if _, err := io.ReadFull(rand.Reader, key); err != nil {
		return nil, fmt.Errorf("failed to generate key: %w", err)
	}
	return key, nil
}

// GenerateKeyBase64 generates a random 32-byte key and returns it as base64
func GenerateKeyBase64() (string, error) {
	key, err := GenerateKey()
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(key), nil
}
