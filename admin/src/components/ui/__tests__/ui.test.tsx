import { render, screen } from '@testing-library/react';
import { Input } from '../Input';
import { Select } from '../Select';
import { Textarea } from '../Textarea';
import { describe, it, expect } from 'vitest';
import userEvent from '@testing-library/user-event';

describe('UI Components', () => {
    describe('Input', () => {
        it('renders with label and associates via id', () => {
            render(<Input label="Test Input" />);
            const input = screen.getByLabelText('Test Input');
            expect(input).toBeInTheDocument();
        });

        it('displays error and sets aria-invalid', () => {
            render(<Input label="Test Input" error="Error message" />);
            const input = screen.getByLabelText('Test Input');
            expect(input).toHaveAttribute('aria-invalid', 'true');
            const err = screen.getByText('Error message');
            expect(err).toBeInTheDocument();
        });
    });

    describe('Select', () => {
        it('renders options and allows selection', async () => {
            const user = userEvent.setup();
            const options = [
                { value: '1', label: 'One' },
                { value: '2', label: 'Two' },
            ];
            render(<Select label="Test Select" options={options} />);
            const select = screen.getByLabelText('Test Select');
            expect(select).toBeInTheDocument();
            await user.selectOptions(select, '2');
            expect(select).toHaveValue('2');
        });

        it('displays error', () => {
            render(<Select label="Test Select" error="Select Error" />);
            const err = screen.getByText('Select Error');
            expect(err).toBeInTheDocument();
            const select = screen.getByLabelText('Test Select');
            expect(select).toHaveAttribute('aria-invalid', 'true');
        });
    });

    describe('Textarea', () => {
        it('renders with label', () => {
            render(<Textarea label="Test Area" />);
            expect(screen.getByLabelText('Test Area')).toBeInTheDocument();
        });
    });
});
