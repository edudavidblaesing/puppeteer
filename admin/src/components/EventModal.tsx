'use client';

import { useState, useEffect, useRef } from 'react';
import { 
  X, Save, Calendar, MapPin, Building2, Users, Link, 
  Plus, Trash2, Search, ExternalLink, Eye, EyeOff 
} from 'lucide-react';
import { Event } from '@/types';

interface EventModalProps {
  event: Event | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (id: string, data: Partial<Event>) => Promise<void>;
}

// Parse artists string to array
function parseArtists(artistsStr: string | null): string[] {
  if (!artistsStr) return [];
  return artistsStr.split(',').map(a => a.trim()).filter(a => a.length > 0);
}

// Convert artists array back to string
function artistsToString(artists: string[]): string {
  return artists.join(', ');
}

export default function EventModal({ event, isOpen, onClose, onSave }: EventModalProps) {
  const [formData, setFormData] = useState<Partial<Event>>({});
  const [artists, setArtists] = useState<string[]>([]);
  const [newArtist, setNewArtist] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'artists' | 'venue'>('details');
  const artistInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (event) {
      setFormData({
        title: event.title,
        date: event.date?.split('T')[0] || '',
        start_time: event.start_time?.split('T')[1]?.substring(0, 5) || '',
        end_time: event.end_time?.split('T')[1]?.substring(0, 5) || '',
        venue_name: event.venue_name || '',
        venue_address: event.venue_address || '',
        venue_city: event.venue_city || '',
        description: event.description || '',
        content_url: event.content_url || '',
        is_published: event.is_published || false,
      });
      setArtists(parseArtists(event.artists));
      setActiveTab('details');
    }
  }, [event]);

  if (!isOpen || !event) return null;

  const handleAddArtist = () => {
    const trimmed = newArtist.trim();
    if (trimmed && !artists.includes(trimmed)) {
      setArtists([...artists, trimmed]);
      setNewArtist('');
      artistInputRef.current?.focus();
    }
  };

  const handleRemoveArtist = (index: number) => {
    setArtists(artists.filter((_, i) => i !== index));
  };

  const handleMoveArtist = (index: number, direction: 'up' | 'down') => {
    const newArtists = [...artists];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex >= 0 && newIndex < artists.length) {
      [newArtists[index], newArtists[newIndex]] = [newArtists[newIndex], newArtists[index]];
      setArtists(newArtists);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSave(event.id, {
        ...formData,
        artists: artistsToString(artists),
      });
      onClose();
    } catch (error) {
      console.error('Failed to save:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddArtist();
    }
  };

  return (
    <div className="fixed inset-0 overflow-y-auto" style={{ zIndex: 9999 }}>
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/50" onClick={onClose} />

        <div className="relative bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="bg-white border-b px-6 py-4 flex items-center justify-between flex-shrink-0">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Edit Event</h2>
              <p className="text-sm text-gray-500 truncate max-w-md">{event.title}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, is_published: !formData.is_published })}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  formData.is_published 
                    ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' 
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {formData.is_published ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                {formData.is_published ? 'Published' : 'Draft'}
              </button>
              <button
                onClick={onClose}
                className="p-1.5 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="border-b px-6 flex-shrink-0">
            <div className="flex gap-6">
              {(['details', 'artists', 'venue'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab === 'details' && 'Details'}
                  {tab === 'artists' && `Artists (${artists.length})`}
                  {tab === 'venue' && 'Venue'}
                </button>
              ))}
            </div>
          </div>

          {/* Form Content */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
            <div className="p-6 space-y-5">
              {/* Details Tab */}
              {activeTab === 'details' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                    <input
                      type="text"
                      value={formData.title || ''}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        <Calendar className="w-4 h-4 inline mr-1" />
                        Date
                      </label>
                      <input
                        type="date"
                        value={formData.date || ''}
                        onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Start</label>
                      <input
                        type="time"
                        value={formData.start_time || ''}
                        onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">End</label>
                      <input
                        type="time"
                        value={formData.end_time || ''}
                        onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      <Link className="w-4 h-4 inline mr-1" />
                      Source URL
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={formData.content_url || ''}
                        onChange={(e) => setFormData({ ...formData, content_url: e.target.value })}
                        className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                      />
                      {formData.content_url && (
                        <a
                          href={formData.content_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                        >
                          <ExternalLink className="w-5 h-5 text-gray-600" />
                        </a>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <textarea
                      value={formData.description || ''}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      rows={5}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 resize-none"
                    />
                  </div>
                </>
              )}

              {/* Artists Tab */}
              {activeTab === 'artists' && (
                <>
                  {/* Add Artist Input */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      <Users className="w-4 h-4 inline mr-1" />
                      Add Artist
                    </label>
                    <div className="flex gap-2">
                      <input
                        ref={artistInputRef}
                        type="text"
                        value={newArtist}
                        onChange={(e) => setNewArtist(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Enter artist name..."
                        className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                      />
                      <button
                        type="button"
                        onClick={handleAddArtist}
                        disabled={!newArtist.trim()}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        <Plus className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  {/* Artist List */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-sm font-medium text-gray-700">
                        Lineup ({artists.length} artist{artists.length !== 1 ? 's' : ''})
                      </label>
                      {artists.length > 0 && (
                        <span className="text-xs text-gray-500">Drag to reorder</span>
                      )}
                    </div>
                    
                    {artists.length === 0 ? (
                      <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed">
                        <Users className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                        <p className="text-sm text-gray-500">No artists added yet</p>
                        <p className="text-xs text-gray-400 mt-1">Add artists using the input above</p>
                      </div>
                    ) : (
                      <ul className="space-y-2 max-h-64 overflow-y-auto">
                        {artists.map((artist, index) => (
                          <li 
                            key={`${artist}-${index}`}
                            className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg group hover:bg-gray-100 transition-colors"
                          >
                            <span className="w-6 h-6 flex items-center justify-center bg-indigo-100 text-indigo-600 rounded-full text-xs font-medium">
                              {index + 1}
                            </span>
                            <span className="flex-1 font-medium text-gray-800">{artist}</span>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                type="button"
                                onClick={() => handleMoveArtist(index, 'up')}
                                disabled={index === 0}
                                className="p-1 hover:bg-white rounded disabled:opacity-30"
                                title="Move up"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleMoveArtist(index, 'down')}
                                disabled={index === artists.length - 1}
                                className="p-1 hover:bg-white rounded disabled:opacity-30"
                                title="Move down"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveArtist(index)}
                                className="p-1 hover:bg-red-100 hover:text-red-600 rounded transition-colors"
                                title="Remove artist"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Quick Add Multiple */}
                  <div className="pt-4 border-t">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Bulk Add (comma-separated)
                    </label>
                    <textarea
                      placeholder="Artist 1, Artist 2, Artist 3..."
                      rows={2}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 resize-none text-sm"
                      onBlur={(e) => {
                        const newArtists = e.target.value.split(',').map(a => a.trim()).filter(a => a && !artists.includes(a));
                        if (newArtists.length > 0) {
                          setArtists([...artists, ...newArtists]);
                          e.target.value = '';
                        }
                      }}
                    />
                    <p className="text-xs text-gray-500 mt-1">Enter multiple artists separated by commas, then click outside</p>
                  </div>
                </>
              )}

              {/* Venue Tab */}
              {activeTab === 'venue' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      <Building2 className="w-4 h-4 inline mr-1" />
                      Venue Name
                    </label>
                    <input
                      type="text"
                      value={formData.venue_name || ''}
                      onChange={(e) => setFormData({ ...formData, venue_name: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      <MapPin className="w-4 h-4 inline mr-1" />
                      City
                    </label>
                    <select
                      value={formData.venue_city || ''}
                      onChange={(e) => setFormData({ ...formData, venue_city: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">Select city...</option>
                      <option value="Berlin">Berlin</option>
                      <option value="Hamburg">Hamburg</option>
                      <option value="London">London</option>
                      <option value="Paris">Paris</option>
                      <option value="Amsterdam">Amsterdam</option>
                      <option value="Barcelona">Barcelona</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                    <input
                      type="text"
                      value={formData.venue_address || ''}
                      onChange={(e) => setFormData({ ...formData, venue_address: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  {/* Map Preview Placeholder */}
                  <div className="bg-gray-100 rounded-lg h-40 flex items-center justify-center">
                    <div className="text-center text-gray-500">
                      <MapPin className="w-8 h-8 mx-auto mb-2" />
                      <p className="text-sm">Map preview</p>
                      <p className="text-xs">{formData.venue_city || 'No city selected'}</p>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-gray-50 border-t px-6 py-4 flex items-center justify-between flex-shrink-0">
              <div className="text-sm text-gray-500">
                ID: <code className="bg-gray-200 px-1 rounded">{event.id}</code>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  <Save className="w-4 h-4" />
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
