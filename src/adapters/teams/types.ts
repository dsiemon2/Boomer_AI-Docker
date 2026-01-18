// Microsoft Graph API Types for Teams Integration

export interface GraphTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface OnlineMeetingRequest {
  subject: string;
  startDateTime: string;
  endDateTime: string;
  participants?: {
    attendees?: Array<{
      upn?: string;
      emailAddress?: {
        address: string;
        name?: string;
      };
      role?: 'attendee' | 'presenter' | 'producer';
    }>;
  };
  lobbyBypassSettings?: {
    scope: 'everyone' | 'organization' | 'organizationAndFederated' | 'organizer' | 'invited';
    isDialInBypassEnabled?: boolean;
  };
  allowedPresenters?: 'everyone' | 'organization' | 'roleIsPresenter' | 'organizer';
  autoAdmittedUsers?: 'everyone' | 'everyoneInCompany' | 'everyoneInSameAndFederatedCompany' | 'organizer';
  recordAutomatically?: boolean;
}

export interface OnlineMeeting {
  id: string;
  creationDateTime: string;
  startDateTime: string;
  endDateTime: string;
  joinUrl: string;
  joinWebUrl: string;
  subject: string;
  videoTeleconferenceId?: string;
  externalId?: string;
  audioConferencing?: {
    dialinUrl: string;
    tollNumber: string;
    tollFreeNumber?: string;
    conferenceId: string;
  };
  chatInfo?: {
    threadId: string;
    messageId: string;
    replyChainMessageId?: string;
  };
}

export interface CalendarEvent {
  id?: string;
  subject: string;
  body: {
    contentType: 'text' | 'html';
    content: string;
  };
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  location?: {
    displayName: string;
  };
  attendees?: Array<{
    emailAddress: {
      address: string;
      name?: string;
    };
    type: 'required' | 'optional' | 'resource';
  }>;
  isOnlineMeeting?: boolean;
  onlineMeetingProvider?: 'teamsForBusiness' | 'skypeForBusiness' | 'skypeForConsumer';
  onlineMeeting?: {
    joinUrl: string;
  };
}

export interface SubscriptionRequest {
  changeType: string;
  notificationUrl: string;
  resource: string;
  expirationDateTime: string;
  clientState?: string;
}

export interface Subscription {
  id: string;
  resource: string;
  changeType: string;
  notificationUrl: string;
  expirationDateTime: string;
  clientState?: string;
}

export interface WebhookNotification {
  subscriptionId: string;
  subscriptionExpirationDateTime: string;
  changeType: 'created' | 'updated' | 'deleted';
  resource: string;
  resourceData: {
    id: string;
    '@odata.type': string;
    '@odata.id': string;
    '@odata.etag'?: string;
  };
  clientState?: string;
  tenantId: string;
}

export interface TeamsUser {
  id: string;
  displayName: string;
  mail: string;
  userPrincipalName: string;
}

export interface CreateMeetingOptions {
  subject: string;
  startTime: Date;
  endTime: Date;
  participantEmail: string;
  participantName: string;
  additionalEmail?: string;
  additionalName?: string;
  autoAdmit?: boolean;
  recordAutomatically?: boolean;
}

export interface MeetingResult {
  meetingId: string;
  joinUrl: string;
  joinWebUrl: string;
  conferenceId?: string;
  dialInNumber?: string;
}
