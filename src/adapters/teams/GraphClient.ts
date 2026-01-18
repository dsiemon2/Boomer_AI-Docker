// Microsoft Graph API Client for Teams Integration

import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { logger } from '../../utils/logger.js';
import {
  GraphTokenResponse,
  OnlineMeetingRequest,
  OnlineMeeting,
  CalendarEvent,
  SubscriptionRequest,
  Subscription,
  TeamsUser,
} from './types.js';

interface GraphClientConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

export class GraphClient {
  private config: GraphClientConfig;
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;
  private httpClient: AxiosInstance;

  constructor(config: GraphClientConfig) {
    this.config = config;
    this.httpClient = axios.create({
      baseURL: 'https://graph.microsoft.com/v1.0',
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Acquire access token using client credentials flow
   */
  private async acquireToken(): Promise<string> {
    // Return cached token if still valid
    if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return this.accessToken;
    }

    const tokenUrl = `https://login.microsoftonline.com/${this.config.tenantId}/oauth2/v2.0/token`;

    const params = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    });

    try {
      const response = await axios.post<GraphTokenResponse>(tokenUrl, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      const token = response.data.access_token;
      this.accessToken = token;
      // Set expiry 5 minutes before actual expiry for safety
      this.tokenExpiry = new Date(Date.now() + (response.data.expires_in - 300) * 1000);

      logger.info('Graph API token acquired successfully');
      return token;
    } catch (error) {
      logger.error({ error }, 'Failed to acquire Graph API token');
      throw new Error('Failed to authenticate with Microsoft Graph API');
    }
  }

  /**
   * Make authenticated request to Graph API
   */
  private async request<T>(config: AxiosRequestConfig): Promise<T> {
    const token = await this.acquireToken();

    const response = await this.httpClient.request<T>({
      ...config,
      headers: {
        ...config.headers,
        Authorization: `Bearer ${token}`,
      },
    });

    return response.data;
  }

  // ==================== Online Meetings ====================

  /**
   * Create an online meeting
   */
  async createOnlineMeeting(userId: string, meeting: OnlineMeetingRequest): Promise<OnlineMeeting> {
    logger.info({ userId, subject: meeting.subject }, 'Creating online meeting');

    return this.request<OnlineMeeting>({
      method: 'POST',
      url: `/users/${userId}/onlineMeetings`,
      data: meeting,
    });
  }

  /**
   * Get an online meeting by ID
   */
  async getOnlineMeeting(userId: string, meetingId: string): Promise<OnlineMeeting> {
    return this.request<OnlineMeeting>({
      method: 'GET',
      url: `/users/${userId}/onlineMeetings/${meetingId}`,
    });
  }

  /**
   * Update an online meeting
   */
  async updateOnlineMeeting(
    userId: string,
    meetingId: string,
    updates: Partial<OnlineMeetingRequest>
  ): Promise<OnlineMeeting> {
    logger.info({ userId, meetingId }, 'Updating online meeting');

    return this.request<OnlineMeeting>({
      method: 'PATCH',
      url: `/users/${userId}/onlineMeetings/${meetingId}`,
      data: updates,
    });
  }

  /**
   * Delete an online meeting
   */
  async deleteOnlineMeeting(userId: string, meetingId: string): Promise<void> {
    logger.info({ userId, meetingId }, 'Deleting online meeting');

    await this.request<void>({
      method: 'DELETE',
      url: `/users/${userId}/onlineMeetings/${meetingId}`,
    });
  }

  // ==================== Calendar Events ====================

  /**
   * Create a calendar event with Teams meeting
   */
  async createCalendarEvent(userId: string, event: CalendarEvent): Promise<CalendarEvent> {
    logger.info({ userId, subject: event.subject }, 'Creating calendar event');

    return this.request<CalendarEvent>({
      method: 'POST',
      url: `/users/${userId}/calendar/events`,
      data: event,
    });
  }

  /**
   * Get a calendar event by ID
   */
  async getCalendarEvent(userId: string, eventId: string): Promise<CalendarEvent> {
    return this.request<CalendarEvent>({
      method: 'GET',
      url: `/users/${userId}/calendar/events/${eventId}`,
    });
  }

  /**
   * Update a calendar event
   */
  async updateCalendarEvent(
    userId: string,
    eventId: string,
    updates: Partial<CalendarEvent>
  ): Promise<CalendarEvent> {
    logger.info({ userId, eventId }, 'Updating calendar event');

    return this.request<CalendarEvent>({
      method: 'PATCH',
      url: `/users/${userId}/calendar/events/${eventId}`,
      data: updates,
    });
  }

  /**
   * Delete a calendar event
   */
  async deleteCalendarEvent(userId: string, eventId: string): Promise<void> {
    logger.info({ userId, eventId }, 'Deleting calendar event');

    await this.request<void>({
      method: 'DELETE',
      url: `/users/${userId}/calendar/events/${eventId}`,
    });
  }

  /**
   * List calendar events within a time range
   */
  async listCalendarEvents(
    userId: string,
    startDateTime: string,
    endDateTime: string
  ): Promise<{ value: CalendarEvent[] }> {
    return this.request<{ value: CalendarEvent[] }>({
      method: 'GET',
      url: `/users/${userId}/calendar/calendarView`,
      params: {
        startDateTime,
        endDateTime,
      },
    });
  }

  // ==================== Subscriptions (Webhooks) ====================

  /**
   * Create a webhook subscription
   */
  async createSubscription(subscription: SubscriptionRequest): Promise<Subscription> {
    logger.info({ resource: subscription.resource }, 'Creating webhook subscription');

    return this.request<Subscription>({
      method: 'POST',
      url: '/subscriptions',
      data: subscription,
    });
  }

  /**
   * Get a subscription by ID
   */
  async getSubscription(subscriptionId: string): Promise<Subscription> {
    return this.request<Subscription>({
      method: 'GET',
      url: `/subscriptions/${subscriptionId}`,
    });
  }

  /**
   * Renew a subscription
   */
  async renewSubscription(subscriptionId: string, expirationDateTime: string): Promise<Subscription> {
    logger.info({ subscriptionId }, 'Renewing webhook subscription');

    return this.request<Subscription>({
      method: 'PATCH',
      url: `/subscriptions/${subscriptionId}`,
      data: { expirationDateTime },
    });
  }

  /**
   * Delete a subscription
   */
  async deleteSubscription(subscriptionId: string): Promise<void> {
    logger.info({ subscriptionId }, 'Deleting webhook subscription');

    await this.request<void>({
      method: 'DELETE',
      url: `/subscriptions/${subscriptionId}`,
    });
  }

  /**
   * List all subscriptions
   */
  async listSubscriptions(): Promise<{ value: Subscription[] }> {
    return this.request<{ value: Subscription[] }>({
      method: 'GET',
      url: '/subscriptions',
    });
  }

  // ==================== Users ====================

  /**
   * Get user by email or UPN
   */
  async getUser(userPrincipalName: string): Promise<TeamsUser> {
    return this.request<TeamsUser>({
      method: 'GET',
      url: `/users/${userPrincipalName}`,
      params: {
        $select: 'id,displayName,mail,userPrincipalName',
      },
    });
  }

  /**
   * Get current authenticated user (for delegated auth)
   */
  async getCurrentUser(): Promise<TeamsUser> {
    return this.request<TeamsUser>({
      method: 'GET',
      url: '/me',
      params: {
        $select: 'id,displayName,mail,userPrincipalName',
      },
    });
  }

  /**
   * Search users by display name or email
   */
  async searchUsers(query: string): Promise<{ value: TeamsUser[] }> {
    return this.request<{ value: TeamsUser[] }>({
      method: 'GET',
      url: '/users',
      params: {
        $filter: `startsWith(displayName,'${query}') or startsWith(mail,'${query}')`,
        $select: 'id,displayName,mail,userPrincipalName',
        $top: 10,
      },
    });
  }
}

// Singleton factory for creating GraphClient instances
let graphClientInstance: GraphClient | null = null;

export function getGraphClient(): GraphClient {
  if (!graphClientInstance) {
    const tenantId = process.env.MICROSOFT_TENANT_ID;
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;

    if (!tenantId || !clientId || !clientSecret) {
      throw new Error('Microsoft Graph API credentials not configured. Set MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID, and MICROSOFT_CLIENT_SECRET environment variables.');
    }

    graphClientInstance = new GraphClient({
      tenantId,
      clientId,
      clientSecret,
    });
  }

  return graphClientInstance;
}

export function resetGraphClient(): void {
  graphClientInstance = null;
}
