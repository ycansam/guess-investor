import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { styles } from './chat-input.styles';

interface ChatInputProps {
    onSend: (message: string) => void;
    isLoading?: boolean;
    placeholder?: string;
}

export const ChatInput: React.FC<ChatInputProps> = ({
    onSend,
    isLoading = false,
    placeholder = 'Pregunta sobre inversiones...'
}) => {
    const [message, setMessage] = useState('');

    const handleSend = () => {
        if (message.trim() && !isLoading) {
            onSend(message.trim());
            setMessage('');
        }
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
            <View style={styles.container}>
                <View style={styles.inputContainer}>
                    <TextInput
                        style={styles.input}
                        value={message}
                        onChangeText={setMessage}
                        placeholder={placeholder}
                        placeholderTextColor="#999"
                        multiline
                        maxLength={1000}
                        editable={!isLoading}
                        onSubmitEditing={handleSend}
                        returnKeyType="send"
                        onKeyPress={(ev) => {
                            if (ev.nativeEvent.key === 'Enter') {
                                ev.preventDefault();
                                handleSend();
                            }
                        }}
                    />
                    <TouchableOpacity
                        style={[
                            styles.sendButton,
                            (!message.trim() || isLoading) && styles.sendButtonDisabled
                        ]}
                        onPress={handleSend}
                        disabled={!message.trim() || isLoading}
                    >
                        {isLoading ? (
                            <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                            <Ionicons name="send" size={20} color="#FFFFFF" />
                        )}
                    </TouchableOpacity>
                </View>
            </View>
        </KeyboardAvoidingView>
    );
};
