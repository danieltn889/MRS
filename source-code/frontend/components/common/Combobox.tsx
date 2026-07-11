import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Loader } from 'lucide-react';

// Generalized searchable dropdown. Based on the string-options Combobox in
// components/profile/EducationSection.tsx, extended to support {label,value}
// options, a disabled/loading state (for cascading dropdowns whose options
// depend on an async fetch triggered by a parent selection), and an
// allowFreeText toggle (on for the country selector, which must accept a
// typed value not in the list; off for the Rwanda location cascade, which
// must only accept a real option).
export interface ComboboxOption {
  label: string;
  value: string;
}

interface ComboboxProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  loading?: boolean;
  allowFreeText?: boolean;
}

const Combobox: React.FC<ComboboxProps> = ({
  id, value, onChange, options, placeholder, required, disabled, loading, allowFreeText = true
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const [filteredOptions, setFilteredOptions] = useState<ComboboxOption[]>(options);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setInputValue(value); }, [value]);
  useEffect(() => { setFilteredOptions(options); }, [options]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    onChange(newValue);
    setFilteredOptions(options.filter(opt => opt.label.toLowerCase().includes(newValue.toLowerCase())));
    setIsOpen(true);
  };

  const handleSelectOption = (option: ComboboxOption) => {
    setInputValue(option.label);
    onChange(option.value);
    setIsOpen(false);
  };

  const handleFocus = () => {
    if (disabled) return;
    setFilteredOptions(options);
    setIsOpen(true);
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <div className="relative">
        <input
          id={id}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleFocus}
          placeholder={disabled ? 'Select the field above first': placeholder}
          required={required}
          disabled={disabled}
          autoComplete="off"
          className={`w-full px-3 py-2 pr-8 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
            disabled ? 'bg-gray-100 cursor-not-allowed text-gray-400': ''
          }`}
        />
        <span className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400">
          {loading ? <Loader size={16} className="animate-spin" /> : <ChevronDown size={16} />}
        </span>
      </div>
      {isOpen && !disabled && filteredOptions.length > 0 && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto">
          {filteredOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => handleSelectOption(option)}
              className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors text-sm"
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
      {isOpen && !disabled && filteredOptions.length === 0 && inputValue && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg p-3 text-sm text-gray-500">
          {allowFreeText ? `Press Enter to use "${inputValue}"` : 'No matches found'}
        </div>
      )}
    </div>
  );
};

export default Combobox;
