// Teams Service - High-level meeting scheduling operations for Boomer AI

import { getGraphClient, GraphClient } from './GraphClient.js';
import { logger } from '../../utils/logger.js';
import {
  OnlineMeetingRequest,
  OnlineMeeting,
  CalendarEvent,
  CreateMeetingOptions,
  MeetingResult,
  Subscription,
  SubscriptionRequest,
} from './types.js';

export class TeamsService {
  private graphClient: GraphClient;
  private organizerUserId: string;

  constructor(organizerUserId: string) {
    this.graphClient = getGraphClient();
    this.organizerUserId = organizerUserId;
  }

  /**
   * Schedule a Teams meeting (family call, doctor appointment, caregiver check-in)
   */
  async scheduleMeeting(options: CreateMeetingOptions): Promise<MeetingResult> {
    logger.info(
      { subject: options.subject, participantEmail: options.participantEmail },
      'Scheduling Teams meeting'
    );

    // Build the meeting request
    const meetingRequest: OnlineMeetingRequest = {
      subject: options.subject,
      startDateTime: options.startTime.toISOString(),
      endDateTime: options.endTime.toISOString(),
      participants: {
        attendees: [
          {
            emailAddress: {
              address: options.participantEmail,
              name: options.participantName,
            },
            role: 'attendee',
          },
        ],
      },
      lobbyBypassSettings: {
        scope: options.autoAdmit ? 'everyone' : 'organizer',
        isDialInBypassEnabled: options.autoAdmit,
      },
      allowedPresenters: 'everyone', // Allow all participants to present for accessibility
      autoAdmittedUsers: options.autoAdmit ? 'everyone' : 'organizer',
      recordAutomatically: options.recordAutomatically ?? false,
    };

    // Add additional participant if specified (e.g., caregiver, family member)
    if (options.additionalEmail) {
      meetingRequest.participants!.attendees!.push({
        emailAddress: {
          address: options.additionalEmail,
          name: options.additionalName,
        },
        role: 'attendee',
      });
    }

    try {
      // Create the online meeting
      const meeting = await this.graphClient.createOnlineMeeting(
        this.organizerUserId,
        meetingRequest
      );

      // Also create a calendar event for visibility
      await this.createCalendarInvite(meeting, options);

      logger.info(
        { meetingId: meeting.id, joinUrl: meeting.joinWebUrl },
        'Meeting scheduled successfully'
      );

      return {
        meetingId: meeting.id,
        joinUrl: meeting.joinUrl,
        joinWebUrl: meeting.joinWebUrl,
        conferenceId: meeting.audioConferencing?.conferenceId,
        dialInNumber: meeting.audioConferencing?.tollNumber,
      };
    } catch (error) {
      logger.error({ error, options }, 'Failed to schedule meeting');
      throw error;
    }
  }

  /**
   * Create calendar invite for the meeting
   */
  private async createCalendarInvite(
    meeting: OnlineMeeting,
    options: CreateMeetingOptions
  ): Promise<CalendarEvent> {
    const attendees: CalendarEvent['attendees'] = [
      {
        emailAddress: {
          address: options.participantEmail,
          name: options.participantName,
        },
        type: 'required',
      },
    ];

    if (options.additionalEmail) {
      attendees.push({
        emailAddress: {
          address: options.additionalEmail,
          name: options.additionalName,
        },
        type: 'optional',
      });
    }

    const calendarEvent: CalendarEvent = {
      subject: options.subject,
      body: {
        contentType: 'html',
        content: this.generateInviteBody(meeting, options),
      },
      start: {
        dateTime: options.startTime.toISOString(),
        timeZone: 'UTC',
      },
      end: {
        dateTime: options.endTime.toISOString(),
        timeZone: 'UTC',
      },
      location: {
        displayName: 'Microsoft Teams Video Call',
      },
      attendees,
      isOnlineMeeting: true,
      onlineMeetingProvider: 'teamsForBusiness',
      onlineMeeting: {
        joinUrl: meeting.joinWebUrl,
      },
    };

    return this.graphClient.createCalendarEvent(this.organizerUserId, calendarEvent);
  }

  /**
   * Generate HTML body for meeting invite (senior-friendly)
   */
  private generateInviteBody(meeting: OnlineMeeting, options: CreateMeetingOptions): string {
    let body = `
      <div style="font-family: Arial, sans-serif; font-size: 16px; line-height: 1.6;">
        <h2 style="color: #16a34a;">Video Call Scheduled</h2>
        <p>Hello ${options.participantName},</p>
        <p>A video call has been scheduled. Please join using the link below at the scheduled time.</p>

        <div style="background: #f0f9ff; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 5px 0;"><strong>📅 Subject:</strong> ${options.subject}</p>
          <p style="margin: 5px 0;"><strong>📆 Date:</strong> ${options.startTime.toLocaleDateString()}</p>
          <p style="margin: 5px 0;"><strong>⏰ Time:</strong> ${options.startTime.toLocaleTimeString()} - ${options.endTime.toLocaleTimeString()}</p>
        </div>

        <div style="background: #16a34a; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
          <a href="${meeting.joinWebUrl}" style="color: white; text-decoration: none; font-size: 18px; font-weight: bold;">
            📹 Click Here to Join the Video Call
          </a>
        </div>
    `;

    if (meeting.audioConferencing) {
      body += `
        <div style="background: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 5px 0;"><strong>📞 Or call in by phone (audio only):</strong></p>
          <p style="margin: 5px 0; font-size: 18px;">Phone: <strong>${meeting.audioConferencing.tollNumber}</strong></p>
          <p style="margin: 5px 0; font-size: 18px;">Conference ID: <strong>${meeting.audioConferencing.conferenceId}#</strong></p>
        </div>
      `;
    }

    body += `
        <hr style="margin: 20px 0;">
        <p style="color: #666; font-size: 14px;"><em>This meeting was scheduled by Boomer AI - Your Voice-First Assistant.</em></p>
      </div>
    `;

    return body;
  }

  /**
   * Reschedule an existing meeting
   */
  async rescheduleMeeting(
    meetingId: string,
    newStartTime: Date,
    newEndTime: Date
  ): Promise<OnlineMeeting> {
    logger.info({ meetingId, newStartTime }, 'Rescheduling meeting');

    return this.graphClient.updateOnlineMeeting(this.organizerUserId, meetingId, {
      startDateTime: newStartTime.toISOString(),
      endDateTime: newEndTime.toISOString(),
    });
  }

  /**
   * Cancel a meeting
   */
  async cancelMeeting(meetingId: string): Promise<void> {
    logger.info({ meetingId }, 'Cancelling meeting');

    await this.graphClient.deleteOnlineMeeting(this.organizerUserId, meetingId);
  }

  /**
   * Get meeting details
   */
  async getMeetingDetails(meetingId: string): Promise<OnlineMeeting> {
    return this.graphClient.getOnlineMeeting(this.organizerUserId, meetingId);
  }

  /**
   * Get upcoming meetings for a time range
   */
  async getUpcomingMeetings(
    startDate: Date,
    endDate: Date
  ): Promise<CalendarEvent[]> {
    const result = await this.graphClient.listCalendarEvents(
      this.organizerUserId,
      startDate.toISOString(),
      endDate.toISOString()
    );

    return result.value;
  }

  /**
   * Subscribe to meeting events (participant joined, left, etc.)
   */
  async subscribeToMeetingEvents(
    meetingId: string,
    webhookUrl: string,
    clientState?: string
  ): Promise<Subscription> {
    const expirationDateTime = new Date();
    expirationDateTime.setHours(expirationDateTime.getHours() + 1); // 1 hour subscription

    const subscriptionRequest: SubscriptionRequest = {
      changeType: 'created,updated',
      notificationUrl: webhookUrl,
      resource: `/communications/onlineMeetings/${meetingId}`,
      expirationDateTime: expirationDateTime.toISOString(),
      clientState,
    };

    return this.graphClient.createSubscription(subscriptionRequest);
  }

  /**
   * Subscribe to calendar changes
   */
  async subscribeToCalendarChanges(
    webhookUrl: string,
    clientState?: string
  ): Promise<Subscription> {
    const expirationDateTime = new Date();
    expirationDateTime.setDate(expirationDateTime.getDate() + 3); // 3 days max for calendar

    const subscriptionRequest: SubscriptionRequest = {
      changeType: 'created,updated,deleted',
      notificationUrl: webhookUrl,
      resource: `/users/${this.organizerUserId}/calendar/events`,
      expirationDateTime: expirationDateTime.toISOString(),
      clientState,
    };

    return this.graphClient.createSubscription(subscriptionRequest);
  }

  /**
   * Renew a subscription before it expires
   */
  async renewSubscription(
    subscriptionId: string,
    hoursToExtend: number = 1
  ): Promise<Subscription> {
    const expirationDateTime = new Date();
    expirationDateTime.setHours(expirationDateTime.getHours() + hoursToExtend);

    return this.graphClient.renewSubscription(subscriptionId, expirationDateTime.toISOString());
  }

  /**
   * Cancel a subscription
   */
  async cancelSubscription(subscriptionId: string): Promise<void> {
    await this.graphClient.deleteSubscription(subscriptionId);
  }
}

// Factory function to create TeamsService instances
export function createTeamsService(organizerUserId: string): TeamsService {
  return new TeamsService(organizerUserId);
}
