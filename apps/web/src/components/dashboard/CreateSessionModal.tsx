import React, { useState } from 'react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { useCreateSession } from '../../hooks/useSession';
import toast from 'react-hot-toast';

interface CreateSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CreateSessionModal: React.FC<CreateSessionModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [title, setTitle] = useState('');
  const createSession = useCreateSession();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    try {
      const session = await createSession.mutateAsync(title.trim());
      toast.success(`Session created! Token: ${session.inviteToken}`);
      setTitle('');
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create session');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New Support Session" size="sm">
      <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <label
            htmlFor="session-title"
            style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', fontWeight: 500 }}
          >
            Session Title
          </label>
          <input
            id="session-title"
            type="text"
            placeholder='e.g. "Customer Support — Ticket #4821"'
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            autoFocus
          />
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            Give this session a descriptive name for your records.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={createSession.isPending}
            disabled={!title.trim()}
          >
            Create Session
          </Button>
        </div>
      </form>
    </Modal>
  );
};
