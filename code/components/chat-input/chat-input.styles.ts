import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
    container: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: '#FFFFFF',
        borderTopWidth: 1,
        borderTopColor: '#E0E0E0',
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        backgroundColor: '#F5F5F5',
        borderRadius: 24,
        paddingLeft: 16,
        paddingRight: 4,
        paddingVertical: 4,
    },
    input: {
        flex: 1,
        fontSize: 16,
        color: '#1A1A1A',
        maxHeight: 100,
        paddingVertical: 10,
        paddingRight: 8,
    },
    sendButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#007AFF',
        justifyContent: 'center',
        alignItems: 'center',
    },
    sendButtonDisabled: {
        backgroundColor: '#B0B0B0',
    },
});
